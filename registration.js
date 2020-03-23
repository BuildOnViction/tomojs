const ethers = require('ethers')
const request = require('request')
const urljoin = require('url-join');
const BigNumber = require('bignumber.js')
const WebSocket = require('ws')

const RegistrationAbi = require('./abis/Registration.json')

const registrationAddress = '0xA1996F69f47ba14Cb7f661010A7C31974277958c'

class Registration {
    constructor (
        endpoint = 'http://localhost:8545',
        pkey = '', // sample
        chainId = 88
    ) {
        this.endpoint = endpoint
        this.chainId = chainId ? chainId : (this.endpoint === 'https://rpc.tomochain.com' ? 88 : 89)
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
    }

    async getRelayerByAddress (node) {
        try {
            const result = await this.contract.functions.getRelayerByCoinbase(node)
            if (result[1] === '0x0000000000000000000000000000000000000000') {
                return false
            }
            return result
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
            const amountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: ethers.utils.hexlify(ethers.utils.bigNumberify(amountBN)),
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(4000000),
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
            const tradeFeeBN = ethers.utils.hexlify(ethers.utils.bigNumberify(tradeFee))
            const nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(4000000),
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
                gasLimit: ethers.utils.hexlify(4000000),
                chainId: this.chainId,
                nonce
            }

            const result = await this.contract.functions.resign(node, txParams)
            return result
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
                gasLimit: ethers.utils.hexlify(4000000),
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
                gasLimit: ethers.utils.hexlify(4000000),
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
                gasLimit: ethers.utils.hexlify(4000000),
                chainId: this.chainId,
                nonce
            }

            const result = await this.contract.functions.refund(node, txParams)

            return result
        } catch (error) {
            throw error
        }
    }
}

module.exports = Registration