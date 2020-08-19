const ethers = require('ethers')
const request = require('request')
const urljoin = require('url-join');
const BigNumber = require('bignumber.js')
const WebSocket = require('ws')
const path = require('path')
const fs = require('fs')
const solc = require('solc')

function createContract () {
    try {
        const p = path.resolve(__dirname, './contracts', 'TomoBridgeWrapToken.sol')
        const contractCode = fs.readFileSync(p, 'UTF-8')
        return contractCode
    } catch (error) {
        throw error
    }
}

function compileContract (contractCode) {
    try {
        const compiledContract = solc.compile(contractCode, 1)
        const contract = compiledContract.contracts['TomoBridgeWrapToken'] ||
            compiledContract.contracts[':' + 'TomoBridgeWrapToken']
        return contract
    } catch (error) {
        throw error
    }
}

async function getABI () {
    let p = path.resolve(__dirname, './abis', 'TomoBridgeWrapToken.json')
    const data = fs.readFileSync(p, 'UTF-8')
    if (data) {
        return JSON.parse(data).abi
    }
}

class Bridge {
    constructor ({
        endpoint,
        pkey,
        chainId,
    }) {
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
    }

    async issueWrapToken ({
        name,
        symbol,
        totalSupply,
        decimals,
        minFee,
        depositFee,
        withdrawFee,
        nonce
    }) {
        try {
            console.log('Creating contract...')
            const contractCode = createContract()

            console.log('Compiling contract...')
            const compliedContract = compileContract(contractCode)

            const bytecode = compliedContract.bytecode
            const abi = JSON.parse(compliedContract.interface)

            const trcContract = {
                abi, bytecode
            }

            console.log('Deploying contract...')

            const factory = new ethers.ContractFactory(
                trcContract.abi,
                trcContract.bytecode,
                this.wallet
            )
            nonce = nonce || await this.provider.getTransactionCount(this.coinbase)
            const txParams = {
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                gasPrice: ethers.utils.hexlify(10000000000000),
                chainId: this.chainId,
                nonce: nonce
            }
            const contract = await factory.deploy(
                [
                    '0x538E9F8D20B37A4a5b8Bd726d7753a3143f21353',
                    '0x8397712b0Ea16AC6f685E8fB061981988e2F598f',
                    '0xcaFC432009EE987604674a43B5cF47125d50B8a6'
                ], 2,
                name,
                symbol,
                decimals,
                (new BigNumber(totalSupply).multipliedBy(10 ** decimals)).toString(10),
                (new BigNumber(minFee).multipliedBy(10 ** decimals)).toString(10),
                (new BigNumber(depositFee).multipliedBy(10 ** decimals)).toString(10),
                (new BigNumber(withdrawFee).multipliedBy(10 ** decimals)).toString(10),
                txParams
            )
            
            await contract.deployed()
            return {
                name,
                symbol,
                totalSupply,
                minFee,
                withdrawFee,
                depositFee,
                decimals,
                contractAddress: contract.address,
                transactionHash: contract.deployTransaction.hash
            }
        } catch (error) {
            throw error
        }
    }

}

module.exports = Bridge
