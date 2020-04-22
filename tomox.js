const ethers = require('ethers')
const request = require('request')
const urljoin = require('url-join');
const BigNumber = require('bignumber.js')
const WebSocket = require('ws')
const TomoZ = require('./tomoz')

const RegistrationAbi = require('./abis/Registration.json')
const LendingRegistrationAbi = require('./abis/LendingRegistration.json')

class TomoX {
    /*
        endpoint,
        pkey,
        chainId,
        registrationAddress,
        lendingAddress 
        */
    constructor (network) {
        this.gasLimit = 4000000
        this.network = network
        this.endpoint = network.endpoint
        this.chainId = network.chainId ? Number(network.chainId) : (this.endpoint === 'https://rpc.tomochain.com' ? 88 : 89)
        if (!network.pkey) {
            let randomWallet = ethers.Wallet.createRandom()
            network.pkey = randomWallet.privateKey
        }
        
        if (network.endpoint.endsWith('.ipc')) {
            this.provider = new ethers.providers.IpcProvider(network.endpoint)
        } else {
            this.provider = new ethers.providers.JsonRpcProvider(network.endpoint)
        }

        this.wallet = new ethers.Wallet(network.pkey, this.provider)
        this.coinbase = this.wallet.address

        this.contract = new ethers.Contract(
            network.registrationAddress || '0x33aeac1209a4dd857833026d2f60d149e740fc7d',
            RegistrationAbi.abi,
            this.wallet
        )

        this.lendingContract = new ethers.Contract(
            network.lendingAddress || '0xbd8b2fb871f97b2d5f0a1af3bf73619b09174b2a',
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

    async getOrderCount (address) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getOrderCount',
                    params: [ address || this.coinbase ],
                    id: 1
                }

                let url = urljoin(this.endpoint)
                let options = {
                    method: 'POST',
                    url: url,
                    json: true,
                    headers: {
                        'content-type': 'application/json'
                    },
                    body: jsonrpc
                }
                request(options, (error, response, body) => {
                    if (error) {
                        return reject(error)
                    }
                    if (response.statusCode !== 200 && response.statusCode !== 201) {
                        return reject(body)
                    }

                    return resolve(body.result)

                })
            } catch(e) {
                return reject(e)
            }
        })
    }

	getOrderHash(order) {
		if (order.type === 'MO') {
			return ethers.utils.solidityKeccak256(
				[
					'bytes',
					'bytes',
					'bytes',
					'bytes',
					'uint256',
					'uint256',
					'string',
					'string',
					'uint256',
				],
				[
					order.exchangeAddress,
					order.userAddress,
					order.baseToken,
					order.quoteToken,
					order.quantity,
					order.side === 'BUY' ? '0' : '1',
					order.status,
					order.type,
					order.nonce
				],
			)
		}
		return ethers.utils.solidityKeccak256(
			[
				'bytes',
				'bytes',
				'bytes',
				'bytes',
				'uint256',
				'uint256',
				'uint256',
				'string',
				'string',
				'uint256',
			],
			[
				order.exchangeAddress,
				order.userAddress,
				order.baseToken,
				order.quoteToken,
                order.quantity,
				order.price,
				order.side === 'BUY' ? '0' : '1',
				order.status,
				order.type,
				order.nonce
			],
		)
	}

    bigToHex(b) {
        return '0x' + (new BigNumber(b)).toString(16)
    }


    async createOrder (order) {
        return new Promise(async (resolve, reject) => {

            try {
                let nonce = order.nonce || await this.getOrderCount()
                let o = {
                    userAddress: this.coinbase,
                    exchangeAddress: order.exchangeAddress,
                    baseToken: order.baseToken,
                    quoteToken: order.quoteToken,
                    side: order.side || 'BUY',
                    type: order.type || 'LO',
                    status: 'NEW'
                }

                let tomoz = new TomoZ(this.network)
           
                let baseToken = await tomoz.getTokenInformation({ tokenAddress: order.baseToken })
                let quoteToken = await tomoz.getTokenInformation({ tokenAddress: order.quoteToken })

                if (!baseToken || !quoteToken) {
                    return reject(Error('Can not get token info'))
                }

                if (o.type !== 'MO') {
                    o.price = this.bigToHex(new BigNumber(order.price).multipliedBy(10 ** quoteToken.decimals))
                }
                o.quantity = this.bigToHex(new BigNumber(order.amount)
                    .multipliedBy(10 ** baseToken.decimals))

                o.nonce = this.bigToHex(nonce)
                o.hash = this.getOrderHash(o)

                let signature = await this.wallet.signMessage(ethers.utils.arrayify(o.hash))
                let { r, s, v } = ethers.utils.splitSignature(signature)
                o.r = r
                o.s = s
                o.v = this.bigToHex(v)

                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_sendOrder',
                    params: [ o ],
                    id: 1
                }

                let url = urljoin(this.endpoint)
                let options = {
                    method: 'POST',
                    url: url,
                    json: true,
                    headers: {
                        'content-type': 'application/json'
                    },
                    body: jsonrpc
                }
                request(options, (error, response, body) => {
                    if (error) {
                        return reject(error)
                    }
                    if (response.statusCode !== 200 && response.statusCode !== 201) {
                        return reject(body)
                    }

                    return resolve(body.result)

                })
            } catch(e) {
                return reject(e)
            }
        })


    }

}

module.exports = TomoX
