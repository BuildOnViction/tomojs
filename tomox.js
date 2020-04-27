const ethers = require('ethers')
const request = require('request')
const urljoin = require('url-join');
const BigNumber = require('bignumber.js')
const WebSocket = require('ws')
const TomoZ = require('./tomoz')
const utils = require('./utils')

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

    async checkRelayerByAddress (node) {
        try {
            let b = false
            const resign = await this.contract.functions.RESIGN_REQUESTS(node)
            b = b || !((new BigNumber(resign)).toString(10) === '0')

            const result = await this.contract.functions.getRelayerByCoinbase(node)
            if (result[1] !== '0x0000000000000000000000000000000000000000') {
                b = true
            }
            return b
        } catch (error) {
            return false
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

    async countRelayers () {
        try {
            let total = await this.contract.functions.RelayerCount()
            let active = await this.contract.functions.ActiveRelayerCount()
            let resigned = new BigNumber(total).minus(new BigNumber(active))
            return {
                active: new BigNumber(active).toString(10),
                resigned: resigned.toString(10)
            }
        } catch (error) {
            throw error
        }
    }

    async register ({
        amount,
        node,
        tradeFee,
        baseTokens,
        quoteTokens,
        nonce
    }) {
        try {
            tradeFee = parseInt(tradeFee * 100)
            if (tradeFee < 0 || tradeFee > 1000) {
                throw new Error('Trade fee must be from 0 to 10')
            }
            const amountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
            nonce = nonce || await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: ethers.utils.hexlify(ethers.utils.bigNumberify(amountBN)),
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.checkRelayerByAddress(node)

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
        quoteTokens,
        nonce
    }) {
        try {
            tradeFee = parseInt(tradeFee * 100)
            if (tradeFee < 0 || tradeFee > 1000) {
                throw new Error('Trade fee must be from 0 to 10')
            }
            const tradeFeeBN = ethers.utils.hexlify(ethers.utils.bigNumberify(tradeFee))
            nonce = await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.checRelayerByAddress(node)

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

            const checkCoinbase = await this.checkRelayerByAddress(node)
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

            const checkCoinbase = await this.checRelayerByAddress(node)

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
        quoteToken,
        nonce
    }) {
        try {
            nonce = nonce || await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: 0,
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.checkRelayerByAddress(node)

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

            const checkCoinbase = await this.checkRelayerByAddress(node)

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
        collateralTokens,
        nonce
    }) {
        try {
            tradeFee = parseInt(tradeFee * 100)
            if (tradeFee < 0 || tradeFee > 1000) {
                throw new Error('Trade fee must be from 0 to 10')
            }
            nonce = nonce || await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: 0,
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const checkCoinbase = await this.checkRelayerByAddress(node)

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
        token, depositRate, liquidationRate, recallRate, nonce
    }) {
        try {
            nonce = nonce || await this.provider.getTransactionCount(this.coinbase)
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

    async addCollateral ({
        token, depositRate, liquidationRate, recallRate, nonce
    }) {
        try {
            nonce = nonce || await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: 0,
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const result = await this.lendingContract.functions.addCollateral(
                token, depositRate, liquidationRate, recallRate, txParams
            )

            return result
        } catch (error) {
            throw error
        }
    }

    async addLendingToken ({
        token, nonce
    }) {
        try {
            nonce = nonce || await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: 0,
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const result = await this.lendingContract.functions.addBaseToken(
                token, txParams
            )

            return result
        } catch (error) {
            throw error
        }
    }

    async setCollateralPrice ({
        token, lendingToken, price, nonce
    }) {
        try {
            nonce = nonce || await this.provider.getTransactionCount(this.coinbase)
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
                prices: {}
            }

            let i = 0
            let bases = []
            try {
                while (bases.length === i) {
                        let base = await this.lendingContract.functions.BASES(i)
                        if (base) {
                            bases.push(base)
                        }
                        i++
                }
            } catch (e) { }

            for (let addr of bases) {
                const price = await this.lendingContract.functions.getCollateralPrice(address, addr)
                ret.prices[addr] = {
                    price: new BigNumber(price[0]).toString(10),
                    blockNumber: new BigNumber(price[1]).toString(10)
                }
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

    async getLendingOrderCount (address = this.coinbase) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getLendingOrderCount',
                    params: [ address ],
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
           
                let baseToken = await tomoz.getTokenInformation(order.baseToken)
                let quoteToken = await tomoz.getTokenInformation(order.quoteToken)

                if (!baseToken || !quoteToken) {
                    return reject(Error('Can not get token info'))
                }

                if (o.type !== 'MO') {
                    o.price = utils.bigToHex(new BigNumber(order.price).multipliedBy(10 ** quoteToken.decimals))
                }
                o.quantity = utils.bigToHex(new BigNumber(order.amount)
                    .multipliedBy(10 ** baseToken.decimals))

                o.nonce = utils.bigToHex(nonce)
                o.hash = utils.createOrderHash(o)

                let signature = await this.wallet.signMessage(ethers.utils.arrayify(o.hash))
                let { r, s, v } = ethers.utils.splitSignature(signature)
                o.r = utils.bigToHex(r)
                o.s = utils.bigToHex(s)
                o.v = utils.bigToHex(v)

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

    async cancelOrder (order) {
        return new Promise(async (resolve, reject) => {

            try {
                let nonce = order.nonce || await this.getOrderCount()
                let o = {
                    userAddress: this.coinbase,
                    exchangeAddress: order.exchangeAddress,
                    orderID: utils.bigToHex(order.orderId),
                    orderHash: order.orderHash,
                    baseToken: order.baseToken,
                    quoteToken: order.quoteToken,
                    status: 'CANCELLED'
                }

                o.nonce = utils.bigToHex(nonce)
                o.hash = order.orderHash

                let signature = await this.wallet.signMessage(ethers.utils.arrayify(utils.createOrderCancelHash(o)))
                let { r, s, v } = ethers.utils.splitSignature(signature)
                o.r = utils.bigToHex(r)
                o.s = utils.bigToHex(s)
                o.v = utils.bigToHex(v)

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

    async createLendingOrder (order) {
        return new Promise(async (resolve, reject) => {

            try {
                let interest = new BigNumber(order.interest)
                    .multipliedBy(10 ** 8)
                let nonce = order.nonce || await this.getLendingOrderCount()
                let o = {
                    userAddress: this.coinbase,
                    relayerAddress: order.relayerAddress,
                    lendingToken: order.lendingToken,
                    term: utils.bigToHex(order.term),
                    interest: utils.bigToHex(interest),
                    side: order.side || 'BORROW',
                    type: order.type || 'LO',
                    status: 'NEW',
                    autoTopUp: '1'
                }

                let tomoz = new TomoZ(this.network)
           
                o.collateralToken = order.collateralToken

                let collateralToken = (o.side == 'BORROW') ? await tomoz.getTokenInformation(order.collateralToken) : true
                let lendingToken = await tomoz.getTokenInformation(order.lendingToken)

                if (!collateralToken || !lendingToken) {
                    return reject(Error('Can not get token info'))
                }

                o.quantity = utils.bigToHex(new BigNumber(order.quantity)
                    .multipliedBy(10 ** lendingToken.decimals))

                o.nonce = utils.bigToHex(nonce)
                o.hash = utils.createLendingOrderHash(o)
                let signature = await this.wallet.signMessage(ethers.utils.arrayify(o.hash))
                let { r, s, v } = ethers.utils.splitSignature(signature)

                o.r = utils.bigToHex(r)
                o.s = utils.bigToHex(s)
                o.v = utils.bigToHex(v)
                o.autoTopUp = true

                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_sendLending',
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

    async cancelLendingOrder (order) {
        return new Promise(async (resolve, reject) => {

            try {
                let nonce = order.nonce || await this.getLendingOrderCount()
                let o = {
                    userAddress: this.coinbase,
                    relayerAddress: order.relayerAddress,
                    lendingToken: order.lendingToken,
                    term: utils.bigToHex(order.term),
                    interest: utils.bigToHex(order.interest),
                    lendingId: utils.bigToHex(order.lendingId),
                    status: 'CANCELLED'
                }

                o.nonce = utils.bigToHex(nonce)
                o.hash = order.hash
                let signature = await this.wallet.signMessage(ethers.utils.arrayify(utils.createLendingCancelHash(o)))
                let { r, s, v } = ethers.utils.splitSignature(signature)

                o.r = utils.bigToHex(r)
                o.s = utils.bigToHex(s)
                o.v = utils.bigToHex(v)

                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_sendLending',
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

    async topupLendingTrade (order) {
        return new Promise(async (resolve, reject) => {

            try {
                let interest = new BigNumber(order.interest)
                    .multipliedBy(10 ** 8)
                let nonce = order.nonce || await this.getLendingOrderCount()
                let o = {
                    userAddress: this.coinbase,
                    relayerAddress: order.relayerAddress,
                    lendingToken: order.lendingToken,
                    term: utils.bigToHex(order.term),
                    tradeId: utils.bigToHex(order.tradeId),
                    type: 'TOPUP',
                    status: 'NEW'
                }

                let tomoz = new TomoZ(this.network)
           
                o.collateralToken = order.collateralToken

                let collateralToken = await tomoz.getTokenInformation(order.collateralToken)

                if (!collateralToken) {
                    return reject(Error('Can not get token info'))
                }

                o.quantity = utils.bigToHex(new BigNumber(order.quantity)
                    .multipliedBy(10 ** collateralToken.decimals))

                o.nonce = utils.bigToHex(nonce)
                o.hash = utils.createTopupHash(o)
                let signature = await this.wallet.signMessage(ethers.utils.arrayify(o.hash))
                let { r, s, v } = ethers.utils.splitSignature(signature)

                o.r = utils.bigToHex(r)
                o.s = utils.bigToHex(s)
                o.v = utils.bigToHex(v)

                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_sendLending',
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

    async repayLendingTrade (order) {
        return new Promise(async (resolve, reject) => {

            try {
                let interest = new BigNumber(order.interest)
                    .multipliedBy(10 ** 8)
                let nonce = order.nonce || await this.getLendingOrderCount()
                let o = {
                    userAddress: this.coinbase,
                    relayerAddress: order.relayerAddress,
                    lendingToken: order.lendingToken,
                    term: utils.bigToHex(order.term),
                    tradeId: utils.bigToHex(order.tradeId),
                    type: 'REPAY',
                    status: 'NEW'
                }

                let tomoz = new TomoZ(this.network)
           
                o.collateralToken = order.collateralToken

                let collateralToken = await tomoz.getTokenInformation(order.collateralToken)

                if (!collateralToken) {
                    return reject(Error('Can not get token info'))
                }

                o.nonce = utils.bigToHex(nonce)
                o.hash = utils.createRepayHash(o)
                let signature = await this.wallet.signMessage(ethers.utils.arrayify(o.hash))
                let { r, s, v } = ethers.utils.splitSignature(signature)

                o.r = utils.bigToHex(r)
                o.s = utils.bigToHex(s)
                o.v = utils.bigToHex(v)

                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_sendLending',
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

    async getBids (baseToken, quoteToken) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getBids',
                    params: [ baseToken, quoteToken ],
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

    async getAsks (baseToken, quoteToken) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getAsks',
                    params: [ baseToken, quoteToken ],
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

    async getBidTree (baseToken, quoteToken) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getBidTree',
                    params: [ baseToken, quoteToken ],
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

    async getAskTree (baseToken, quoteToken) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getAskTree',
                    params: [ baseToken, quoteToken ],
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

    async getOrderById (baseToken, quoteToken, orderId) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getOrderById',
                    params: [ baseToken, quoteToken, parseInt(orderId) ],
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

    async getOrdersByAddress (baseToken, quoteToken, address = this.coinbase) {
        let bids = await this.getBidTree(baseToken, quoteToken)
        let asks = await this.getAskTree(baseToken, quoteToken)
        bids = Object.values(bids || {})

        let ret = []
        for (let bid of bids) {
            let ids = Object.keys(bid.Orders)
            for (let id of ids) {
                let order = await this.getOrderById(baseToken, quoteToken, id)
                if (((order || {}).userAddress || '').toLowerCase() === address.toLowerCase()) {
                    ret.push(order)
                }
            }
        }

        asks = Object.values(asks || {})
        for (let ask of asks) {
            let ids = Object.keys(ask.Orders)
            for (let id of ids) {
                let order = await this.getOrderById(baseToken, quoteToken, id)
                if (((order || {}).userAddress || '').toLowerCase() === address.toLowerCase()) {
                    ret.push(order)
                }
            }
        }
        return ret
    }

    async getBorrows (lendingToken, term) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getBorrows',
                    params: [ lendingToken, term ],
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

    async getInvests (lendingToken, term) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getInvests',
                    params: [ lendingToken, term ],
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

    async getBorrowTree (lendingToken, term) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getBorrowingTree',
                    params: [ lendingToken, term ],
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

    async getInvestTree (lendingToken, term) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getInvestingTree',
                    params: [ lendingToken, term ],
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

    async getLendingOrderById (lendingToken, term, orderId) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getLendingOrderById',
                    params: [ lendingToken, term, parseInt(orderId) ],
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

    async getLendingOrdersByAddress (lendingToken, term, address = this.coinbase) {
        let borrows = await this.getBorrowTree(lendingToken, term)
        let invests = await this.getInvestTree(lendingToken, term)

        borrows = Object.values(borrows || {})

        let ret = []
        for (let borrow of borrows) {
            let ids = Object.keys(borrow.Orders)
            for (let id of ids) {
                let order = await this.getLendingOrderById(lendingToken, term, id)
                if (((order || {}).userAddress || '').toLowerCase() === address.toLowerCase()) {
                    ret.push(order)
                }
            }
        }

        invests = Object.values(invests || {})
        for (let invest of invests) {
            let ids = Object.keys(invest.Orders)
            for (let id of ids) {
                let order = await this.getLendingOrderById(lendingToken, term, id)
                if (((order || {}).userAddress || '').toLowerCase() === address.toLowerCase()) {
                    ret.push(order)
                }
            }
        }
        return ret
    }

    async getLendingTradeTree (lendingToken, term) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getLendingTradeTree',
                    params: [ lendingToken, term ],
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

    async getLendingTradesByAddress (lendingToken, term, address = this.coinbase) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = {
                    jsonrpc: '2.0',
                    method: 'tomox_getLendingTradeTree',
                    params: [ lendingToken, term ],
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

                    let trades = Object.values(body.result)
                    let userTrades = trades.filter(t => {
                        return (t.borrower.toLowerCase() === address.toLowerCase())
                    })

                    return resolve(userTrades)

                })
            } catch(e) {
                return reject(e)
            }
        })
    }

}

module.exports = TomoX
