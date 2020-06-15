
const ethers = require('ethers')
const request = require('request')
const urljoin = require('url-join');
const BigNumber = require('bignumber.js')
const WebSocket = require('ws')
const TomoValidatorAbi = require('./abis/TomoValidator.json')
const TomoX = require('./tomox')
const TomoZ = require('./tomoz')
const utils = require('./utils')

const validatorAddress = '0x0000000000000000000000000000000000000088'

let network = {}

/**
 * The SDK works with TomoChain protocols
 * @constructor
 * @param {string} endpoint - The Url to the node
 * @param {string} pkey - The private key of the wallet
 */
class TomoJS {
    constructor (
        endpoint = 'http://localhost:8545',
        pkey = '', // sample
        chainId = 88
    ) {
        this.gasLimit = 2000000
        this.endpoint = endpoint
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

        this.chainId = chainId ? Number(chainId) : (this.endpoint === 'https://rpc.tomochain.com' ? 88 : 89)
        this.contract = new ethers.Contract(
            validatorAddress,
            TomoValidatorAbi.abi,
            this.wallet
        )

        network.endpoint = this.endpoint
        network.pkey = pkey
        network.chainId = chainId
        this.tomox = new TomoX(network)
        this.tomoz = new TomoZ(network)
        this.tomo = this.provider
        this.network = network
        this.utils = Object.assign(ethers.utils, utils)
    }

	/**
	 * Initial the SDK
	 * @param {string} endpoint - The Url to the node
	 * @param {string} pkey - The private key of the wallet
	 */
    static setProvider(
        endpoint = 'http://localhost:8545',
        pkey = '',
        chainId = 88
    ) {
        return TomoJS.networkInformation(endpoint).then((info) => {
            network = {
                endpoint: endpoint,
                pkey: pkey,
                chainId: info.NetworkId,
                issuerAddress: info.TomoZAddress,
                tomoXAddress: info.TomoXListingAddress,
                registrationAddress: info.RelayerRegistrationAddress,
                lendingAddress: info.LendingAddress
            }

            return new TomoJS(
                endpoint, pkey, info.NetworkId
            )
        }).catch((e) => {
            return new TomoJS(
                endpoint, pkey, chainId
            )
        })
    }

	/**
	 * Stake TOMO to the node
	 * @param {object} stake - The staking information
	 * @param {string} stake.amount - The amount (TOMO) you want to stake
	 * @param {string} stake.node - The coinbase of the node
	 */
    async stake ({ amount, node }) {
        try {
            const voteAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
            const nonce = this.provider.getTransactionCount(this.coinbase)
            const gasPrice = await this.provider.getGasPrice()

            let txParams = {
                value: ethers.utils.hexlify(ethers.utils.bigNumberify(voteAmountBN)),
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(gasPrice)),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce: await nonce
            }

            const result = await this.contract.functions.vote(node, txParams)
            return result
        } catch (error) {
            throw error
        }
    }

	/**
	 * Unstake your TOMO
	 * @param {object} unstake - The unstaking information
	 * @param {string} unstake.amount - The amount (TOMO) you want to unstake
	 * @param {string} unstake.node - The coinbase of the node
	 */
    async unstake ({ amount, node }) {
        try {
            const voteAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
            const value = ethers.utils.hexlify(ethers.utils.bigNumberify(voteAmountBN))
            const nonce = this.provider.getTransactionCount(this.coinbase)
            const gasPrice = await this.provider.getGasPrice()
            let txParams = {
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(gasPrice)),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce: await nonce
            }
            const result = await this.contract.functions.unvote(node, value, txParams)
            return result
        } catch (error) {
            throw error
        }
    }

	/**
	 * Propose a node to become a masternode candidate
	 * @param {object} propose - The propose information
	 * @param {string} propose.amount - The first amount (TOMO) you want to stake for the candidate
	 * @param {string} propose.node - The coinbase of the node
	 */
    async propose ({ amount, node }) {
        try {
            if (amount < 50000) {
                throw new Error('The required amount is at least 50000 TOMO')
            } else {
                const nonce = this.provider.getTransactionCount(this.coinbase)
                const voteAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
                const gasPrice = await this.provider.getGasPrice()
                let txParams = {
                    value: ethers.utils.hexlify(ethers.utils.bigNumberify(voteAmountBN)),
                    gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(gasPrice)),
                    gasLimit: ethers.utils.hexlify(this.gasLimit),
                    chainId: this.chainId,
                    nonce: await nonce
                }
                const result = await this.contract.functions.propose(node, txParams)
                return result
            }
        } catch (error) {
            throw error
        }
    }

	/**
	 * Resign a node
	 * @param {object} resign - The resign information
	 * @param {string} resign.node - The coinbase of the node
	 */
    async resign ({ node }) {
        try {
            const nonce = this.provider.getTransactionCount(this.coinbase)
            const gasPrice = await this.provider.getGasPrice()
            let txParams = {
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(gasPrice)),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce: await nonce
            }
            const result = await this.contract.functions.resign(node, txParams)
            return result
        } catch (error) {
            throw error
        }
    }

    async getWithdrawBlockNumbers () {
        try {
            const result = []
            const blks = await this.contract.functions.getWithdrawBlockNumbers()

            // remove duplicate
            const blks2 = [...new Set(blks.map(b => new BigNumber(b).toString(10)))]
            await Promise.all(blks2.map(async (block, index) => {
                const cap = await this.contract.functions.getWithdrawCap(block)
                const capacity = new BigNumber(cap).div(10 ** 18).toString(10)
                if (capacity !== '0') {
                    result.push({
                        index,
                        blockNumber: block.toString(10),
                        capacity
                    })
                }
            }))
            return result.sort((a, b) => a.index - b.index)
        } catch (error) {
            throw error
        }
    }

    async withdraw ({ blockNumber, index }) {
        try {
            const gasPrice = this.provider.getGasPrice()
            const nonce = this.provider.getTransactionCount(this.coinbase)

            let txParams = {
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(await gasPrice)),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce: await nonce
            }
            const result = await this.contract.functions.withdraw(blockNumber, index, txParams)
            return result
        } catch (error) {
            throw error
        }
    }

    async withdrawAll () {
        try {
            const result = []
            const nonce = this.provider.getTransactionCount(this.coinbase)
            const currentBlock = await this.provider.getBlockNumber() || 0
            const blks = await this.contract.functions.getWithdrawBlockNumbers()

            // remove duplicate
            const blks2 = [...new Set(blks)]
            await Promise.all(blks2.map(async (block, index) => {
                if (new BigNumber(block).isLessThan(currentBlock)) {
                    result.push({
                        index,
                        blockNumber: block.toString(10)
                    })
                }
            }))
            const gasPrice = await this.provider.getGasPrice()

            let txParams = {
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(gasPrice)),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce: await nonce
            }

            const withdraw = await Promise.all(result.map(async r => {
                const withdrawal = await this.contract.functions.withdraw(r.blockNumber, r.index, txParams)
                return withdrawal
            }))
            return withdraw
        } catch (error) {
            throw error
        }
    }

    async getBalance (address) {
        let balance = await this.provider.getBalance(address || this.coinbase)
        return ethers.utils.formatEther(balance)
    }

    async getTokenBalance ( tokenAddress, address = this.coinbase) {
        if (tokenAddress === "0x0000000000000000000000000000000000000001") {
            let balance = await this.provider.getBalance(address)
            return ethers.utils.formatEther(balance)
        }
        let balance = await this.tomoz.balanceOf({
            tokenAddress: tokenAddress,
            userAddress: address
        })
        return balance.balance
    }

    getCandidateStatus({ address, epoch }) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = { 
                    jsonrpc: '2.0',
                    method: 'eth_getCandidateStatus',
                    params: [ address, '0x' + parseInt(epoch).toString(16) || 'latest' ],
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

                    let ret = body.result || {}
                    ret.capacity = new BigNumber(ret.capacity).dividedBy(1e+18).toString(10)
                    return resolve(ret)

                })
            } catch(e) {
                return reject(e)
            }
        })
    }

    send({ address, value, nonce }) {
        return new Promise(async (resolve, reject) => {
            let tx = {
                nonce: nonce,
                gasLimit: 21000,
                gasPrice: ethers.utils.bigNumberify('250000000'),
                to: address,
                value: ethers.utils.parseEther(String(value)),
                data: '0x',
                chainId: this.chainId
            }
            if (tx.nonce) {
                return this.wallet.sendTransaction(tx).then(tx => {
                    return resolve(tx)
                }).catch(e => {
                    return reject(e)
                })
            }
            return this.wallet.getTransactionCount().then(count => {
                let tx = {
                    nonce: count,
                    gasLimit: 21000,
                    gasPrice: ethers.utils.bigNumberify('250000000'),
                    to: address,
                    value: ethers.utils.parseEther(String(value)),
                    data: '0x',
                    chainId: this.chainId
                }
                return this.wallet.sendTransaction(tx)
            }).then(tx => {
                return resolve(tx)
            }).catch(e => {
                return reject(e)
            })
        })
    }

    static randomWallet() {
        let randomWallet = ethers.Wallet.createRandom()
        let privateKey = randomWallet.privateKey
        let address = randomWallet.address
        return { address, privateKey }
    }

    static networkInformation (endpoint) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = { 
                    jsonrpc: '2.0',
                    method: 'posv_networkInformation',
                    params: [ ],
                    id: 1
                }

                let url = urljoin(endpoint || this.endpoint)
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

    getTransactionReceipt ({ hash }) {
        return new Promise(async (resolve, reject) => {

            try {
                const jsonrpc = { 
                    jsonrpc: '2.0',
                    method: 'eth_getTransactionReceipt',
                    params: [ hash ],
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

module.exports = TomoJS
