const ethers = require('ethers')
const request = require('request')
const urljoin = require('url-join');
const BigNumber = require('bignumber.js')
const WebSocket = require('ws')

const RegistrationAbi = require('./abis/Registration.json')
const LendingRegistrationAbi = require('./abis/LendingRegistration.json')

class TomoX {
    constructor (
        endpoint = 'http://localhost:8545',
        pkey = '', // sample
        chainId = 88,
        registrationAddress = '0xA1996F69f47ba14Cb7f661010A7C31974277958c',
        lendingAddress = '0xA1996F69f47ba14Cb7f661010A7C31974277958c'
    ) {
        this.gasLimit = 4000000
        this.endpoint = endpoint
        this.chainId = chainId ? Number(chainId) : (this.endpoint === 'https://rpc.tomochain.com' ? 88 : 89)
        if (!pkey) {
            let randomWallet = ethers.Wallet.createRandom()
            pkey = randomWallet.privateKey
        }
        
        if (endpoint.endsWith('.ipc')) {
            this.provider = new ethers.providers.IpcProvider(endpoint)
        } else {
            this.provider = new ethers.providers.JsonRpcProvider(endpoint)
        }

        this.wallet = new ethers.Wallet(pkey, this.provider)
        this.coinbase = this.wallet.address

        this.contract = new ethers.Contract(
            registrationAddress,
            RegistrationAbi.abi,
            this.wallet
        )

        this.lendingContract = new ethers.Contract(
            lendingAddress,
            LendingRegistrationAbi.abi,
            this.wallet
        )
    }

    async getRelayerByAddress (node) {
        try {
            const resign = await this.contract.functions.RESIGN_REQUESTS(node)

            const result = await this.contract.functions.getRelayerByCoinbase(node)
            if (result[1] === '0x0000000000000000000000000000000000000000') {
                return {}
            }

            const lending = await this.lendingContract.functions.getLendingRelayerByCoinbase(node)

            const ret = {
                index: new BigNumber(result[0]).toString(10),
                coinbase: node,
                owner: result[1],
                deposit: new BigNumber(result[2]).toString(10),
                tradeFee: result[3]/100,
                fromTokens: result[4],
                toTokens: result[5],
                resign: new BigNumber(resign).toString(10)
            }

            if (lending[1].length !== 0) {
                ret.lendingTradeFee = lending[0]/100
                ret.lendingTokens = lending[1]
                ret.lendingTerms = lending[2].map(t => new BigNumber(t).toString(10))
                ret.collateralTokens = lending[3]
            }

            return ret
        } catch (error) {
            throw error
        }
    }

    async getListRelayers () {
        try {
            const count = await this.contract.functions.RelayerCount()
            let ret = []
            for (let i = 0; i < count; i++) {
                let coinbase = await this.contract.functions.RELAYER_COINBASES(i)
                const result = await this.contract.functions.getRelayerByCoinbase(coinbase)
                const resign = await this.contract.functions.RESIGN_REQUESTS(coinbase)

                ret.push({
                    index: new BigNumber(result[0]).toString(10),
                    coinbase: coinbase,
                    owner: result[1],
                    deposit: new BigNumber(result[2]).toString(10),
                    tradeFee: result[3]/100,
                    fromTokens: result[4],
                    toTokens: result[5],
                    resign: new BigNumber(resign).toString(10)
                })
            }
            return ret
        } catch (error) {
            throw error
        }
    }

    async register ({
        amount,
        node,
        tradeFee,
        baseTokens,
        quoteTokens
    }) {
        try {
            tradeFee = parseInt(tradeFee * 100)
            if (tradeFee < 0 || tradeFee > 1000) {
                throw new Error('Trade fee must be from 0 to 10')
            }
            const amountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: ethers.utils.hexlify(ethers.utils.bigNumberify(amountBN)),
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.getRelayerByAddress(node)

            if (!checkCoinbase) {
                const result = await this.contract.functions.register(
                    node,
                    ethers.utils.hexlify(tradeFee),
                    baseTokens,
                    quoteTokens,
                    txParams
                )
                return result
            } else {
                throw new Error('This coinbase address has already become a relayer')
            }
        } catch (error) {
            throw error
        }
    }

    async update ({
        node,
        tradeFee,
        baseTokens,
        quoteTokens
    }) {
        try {
            tradeFee = parseInt(tradeFee * 100)
            if (tradeFee < 0 || tradeFee > 1000) {
                throw new Error('Trade fee must be from 0 to 10')
            }
            const tradeFeeBN = ethers.utils.hexlify(ethers.utils.bigNumberify(tradeFee))
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.getRelayerByAddress(node)

            if (checkCoinbase) {
                const result = await this.contract.functions.update(
                    node,
                    ethers.utils.hexlify(ethers.utils.bigNumberify(tradeFeeBN)),
                    baseTokens,
                    quoteTokens,
                    txParams
                )
                return result
            } else {
                throw new Error('Cannot find node address')
            }
        } catch (error) {
            throw error
        }
    }

    async resign ({ node }) {
        try {
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.getRelayerByAddress(node)
            if (checkCoinbase) {
                const result = await this.contract.functions.resign(node, txParams)
                return result
            } else {
                throw new Error('Cannot find node address')
            }
            
        } catch (error) {
            throw error
        }
    }

    async deposit ({ amount, node }) {
        try {
            const amountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: ethers.utils.hexlify(ethers.utils.bigNumberify(amountBN)),
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.getRelayerByAddress(node)

            if (checkCoinbase) {
                const result = await this.contract.functions.depositMore(
                    node,
                    txParams
                )
                return result
            } else {
                throw new Error('Cannot find node address')
            }
        } catch (error) {
            throw error
        }
    }

    async transfer ({ node, newOwner }) {
        try {
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            if (node === newOwner) {
                throw new Error('New owner cannot be same address with the old owner')
            }

            const checkNode = this.getRelayerByAddress(node)
            const checkNewOwner = this.getRelayerByAddress(newOwner)
            if (!(await checkNode)) {
                throw new Error('Cannot find node address')
            }
            if (await checkNewOwner) {
                throw new Error('New owner address must not be currently used as relayer-coinbase')
            }
            const result = await this.contract.functions.transfer(node, newOwner, txParams)
            return result
        } catch (error) {
            throw error
        }
    }

    async withdraw ({ node }) {
        try {
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const result = await this.contract.functions.refund(node, txParams)

            return result
        } catch (error) {
            throw error
        }
    }

    async list ({
        node,
        baseToken,
        quoteToken
    }) {
        try {
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: 0,
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.getRelayerByAddress(node)

            if (checkCoinbase) {
                const result = await this.contract.functions.listToken(
                    node,
                    baseToken,
                    quoteToken,
                    txParams
                )
                return result
            } else {
                throw new Error('Wrong coinbase')
            }
        } catch (error) {
            throw error
        }
    }

    async delist ({
        node,
        baseToken,
        quoteToken
    }) {
        try {
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: 0,
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.getRelayerByAddress(node)

            if (checkCoinbase) {
                const result = await this.contract.functions.deListToken(
                    node,
                    baseToken,
                    quoteToken,
                    txParams
                )
                return result
            } else {
                throw new Error('Wrong coinbase')
            }
        } catch (error) {
            throw error
        }
    }

    async lendingUpdate ({
        node,
        tradeFee,
        lendingTokens,
        terms,
        collateralTokens
    }) {
        try {
            tradeFee = parseInt(tradeFee * 100)
            if (tradeFee < 0 || tradeFee > 1000) {
                throw new Error('Trade fee must be from 0 to 10')
            }
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: 0,
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.getRelayerByAddress(node)

            if (checkCoinbase) {
                const result = await this.lendingContract.functions.update(
                    node,
                    ethers.utils.hexlify(tradeFee),
                    lendingTokens,
                    terms,
                    collateralTokens,
                    txParams
                )
                return result
            } else  {
                throw new Error('This address is not a relayer coinbase')
            }
        } catch (error) {
            throw error
        }
    }

    async addILOCollateral ({
        token, depositRate, liquidationRate, recallRate, price
    }) {
        try {
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: 0,
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const result = await this.lendingContract.functions.addILOCollateral(
                token, depositRate, liquidationRate, recallRate, txParams
            )

            return result
        } catch (error) {
            throw error
        }
    }

    async setCollateralPrice ({
        token, lendingToken, price
    }) {
        try {
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: 0,
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const result = await this.lendingContract.functions.setCollateralPrice(token, lendingToken, price, txParams)
            return result
        } catch (error) {
            throw error
        }
    }

    async getCollateral ({
        address
    }) {
        try {
            const result = await this.lendingContract.functions.COLLATERAL_LIST(address)
            const ret = {
                depositRate: new BigNumber(result[0]).toString(10),
                liquidationRate: new BigNumber(result[1]).toString(10),
                recallRate: new BigNumber(result[2]).toString(10),
                price: new BigNumber(result[3]).toString(10),
                blockNumber: new BigNumber(result[4]).toString(10)
            }
            return ret
        } catch (error) {
            throw error
        }
    }


}

module.exports = TomoX
