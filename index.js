
const ethers = require('ethers')
const request = require('request')
const urljoin = require('url-join');
const BigNumber = require('bignumber.js')
const WebSocket = require('ws')
const TomoValidatorAbi = require('./abis/TomoValidator.json')

const validatorAddress = '0x0000000000000000000000000000000000000088'

class POSVJS {
    constructor (
        endpoint = 'http://localhost:8545',
        pkey = '', // sample
        chainId = 88
    ) {
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

        this.contract = new ethers.Contract(
            validatorAddress,
            TomoValidatorAbi.abi,
            this.wallet
        )
    }

    async stake ({ amount, node }) {
        try {
            const voteAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
            const gasPrice = await this.provider.getGasPrice()

            let txParams = {
                value: ethers.utils.hexlify(ethers.utils.bigNumberify(voteAmountBN)),
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(gasPrice)),
                gasLimit: ethers.utils.hexlify(2000000),
                chainId: this.chainId
            }

            const result = await this.contract.functions.vote(node, txParams)
            return result
        } catch (error) {
            throw error
        }
    }

    async unstake ({ amount, node }) {
        try {
            const voteAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
            const value = ethers.utils.hexlify(ethers.utils.bigNumberify(voteAmountBN))
            const gasPrice = await this.provider.getGasPrice()
            let txParams = {
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(gasPrice)),
                gasLimit: ethers.utils.hexlify(2000000),
                chainId: this.endpoint === 'https://rpc.tomochain.com' ? 88 : 89
            }
            const result = await this.contract.functions.unvote(node, value, txParams)
            return result
        } catch (error) {
            throw error
        }
    }

    async propose ({ amount, node }) {
        try {
            if (amount < 50000) {
                throw new Error('The required amount is at least 50000 TOMO')
            } else {
                const voteAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
                const gasPrice = await this.provider.getGasPrice()
                let txParams = {
                    value: ethers.utils.hexlify(ethers.utils.bigNumberify(voteAmountBN)),
                    gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(gasPrice)),
                    gasLimit: ethers.utils.hexlify(2000000),
                    chainId: this.endpoint === 'https://rpc.tomochain.com' ? 88 : 89
                }
                const result = await this.contract.functions.propose(node, txParams)
                return result
            }
        } catch (error) {
            throw error
        }
    }

    async resign ({ node }) {
        try {
            const gasPrice = await this.provider.getGasPrice()
            let txParams = {
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(gasPrice)),
                gasLimit: ethers.utils.hexlify(2000000),
                chainId: this.endpoint === 'https://rpc.tomochain.com' ? 88 : 89
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
            const blks2 = [...new Set(blks)]
            await Promise.all(blks2.map(async (block, index) => {
                const cap = await this.contract.functions.getWithdrawCap(block)
                result[index] = {
                    index,
                    blockNumber: block.toString(10),
                    capacity: new BigNumber(cap).div(10 ** 18).toString(10)
                }
            }))
            return result
        } catch (error) {
            throw error
        }
    }

    async withdraw ({ blockNumber, index }) {
        try {
            const gasPrice = await this.provider.getGasPrice()

            let txParams = {
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(gasPrice)),
                gasLimit: ethers.utils.hexlify(2000000),
                chainId: this.endpoint === 'https://rpc.tomochain.com' ? 88 : 89
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
                gasLimit: ethers.utils.hexlify(2000000),
                chainId: this.endpoint === 'https://rpc.tomochain.com' ? 88 : 89
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

    async getBalance ({ address }) {
        let balance = await this.provider.getBalance(address || this.coinbase)
        return ethers.utils.formatEther(balance)
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

    send({ address, value }) {
        return new Promise(async (resolve, reject) => {
			return this.wallet.getTransactionCount().then(count => {
				let tx = {
					nonce: count,
					gasLimit: 21000,
					gasPrice: ethers.utils.bigNumberify('250000000'),
					to: address,
					value: ethers.utils.parseEther(value),
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

    randomWallet() {
        let randomWallet = ethers.Wallet.createRandom()
        let privateKey = randomWallet.privateKey
        let address = randomWallet.address
        return { address, privateKey }
    }
}

module.exports = POSVJS
