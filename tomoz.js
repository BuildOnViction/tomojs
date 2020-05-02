const ethers = require('ethers')
const request = require('request')
const urljoin = require('url-join');
const BigNumber = require('bignumber.js')
const WebSocket = require('ws')
const path = require('path')
const fs = require('fs')
const solc = require('solc')

const IssuerAbi = require('./abis/TRC21Issuer.json')
const TomoXListingAbi = require('./abis/TOMOXListing.json')

function createContract () {
    try {
        const p = path.resolve(__dirname, './contracts', 'TRC21Mintable.sol')
        const contractCode = fs.readFileSync(p, 'UTF-8')
        return contractCode
    } catch (error) {
        throw error
    }
}

function compileContract (contractCode) {
    try {
        const compiledContract = solc.compile(contractCode, 1)
        const contract = compiledContract.contracts['MyTRC21Mintable'] ||
            compiledContract.contracts[':' + 'MyTRC21Mintable']
        return contract
    } catch (error) {
        throw error
    }
}

async function getABI (isMintable = true) {
    let p
    if (isMintable) {
        p = path.resolve(__dirname, './abis', 'MyTRC21Mintable.json')
        const data = fs.readFileSync(p, 'UTF-8')
        if (data) {
            return JSON.parse(data).abi
        }
    } else {
        p = path.resolve(__dirname, './abis', 'MyTRC21.json')
        const data = fs.readFileSync(p, 'UTF-8')
        if (data) {
            return JSON.parse(data).abi
        }
    }
}

class TomoZ {
    constructor ({
        endpoint,
        pkey,
        chainId,
        issuerAddress,
        tomoXAddress,
    }) {
        this.gasLimit = 2000000
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

        this.issuerContract = new ethers.Contract(
            issuerAddress || '0xc44ac3e7ea0f6471da752886209c76c4ebffd1fb',
            IssuerAbi.abi,
            this.wallet
        )
        this.tomoXContract = new ethers.Contract(
            tomoXAddress || '0x6cac761fe6c31e3ecab1121b00bfa708d72d85ce',
            TomoXListingAbi.abi,
            this.wallet
        )
    }

    async issueTRC21 ({
        name,
        symbol,
        totalSupply,
        decimals,
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
                name,
                symbol,
                decimals,
                (new BigNumber(totalSupply).multipliedBy(10 ** decimals)).toString(10),
                (new BigNumber(0).multipliedBy(10 ** decimals)).toString(10),
                txParams
            )
            
            await contract.deployed()
            return {
                name,
                symbol,
                totalSupply,
                decimals,
                contractAddress: contract.address,
                transactionHash: contract.deployTransaction.hash
            }
        } catch (error) {
            throw error
        }
    }

    async updateFee ({ tokenAddress, fee }) {
        try {
            const isAppliedTomoZ = await this.isAppliedTomoZ(tokenAddress)

            if (!isAppliedTomoZ) {
                throw new Error('This token have not applied to TomoZ')
            } else {
                const abi = getABI()
                const nonce = this.provider.getTransactionCount(this.coinbase)
                const gasPrice = this.provider.getGasPrice()

                const contract = new ethers.Contract(
                    tokenAddress,
                    await abi,
                    this.wallet
                )
                const owner = await contract.functions.issuer()
                if (this.coinbase.toLowerCase() !== owner.toLowerCase()) {
                    throw new Error('Only owner of the contract can edit fee')
                }

                const txParams = {
                    gasLimit: ethers.utils.hexlify(this.gasLimit),
                    gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(await gasPrice)),
                    chainId: this.chainId,
                    nonce: await nonce
                }

                const decimals = contract.functions.decimals()
                const result = await contract.functions.setMinFee(
                    (new BigNumber(fee).multipliedBy(10 ** await decimals)).toString(10),
                    txParams
                )
                return result
            }
        } catch (error) {
            throw error
        }
    }

    async depositPoolingFee ({ tokenAddress, amount }) {
        try {
            const isAppliedTomoZ = await this.isAppliedTomoZ(tokenAddress)

            if (!isAppliedTomoZ) {
                throw new Error('This token have not applied to TomoZ')
            } else {
                const depAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
                const nonce = this.provider.getTransactionCount(this.coinbase)
                const gasPrice = this.provider.getGasPrice()
                const txParams = {
                    value: ethers.utils.hexlify(ethers.utils.bigNumberify(depAmountBN)),
                    gasLimit: ethers.utils.hexlify(this.gasLimit),
                    gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(await gasPrice)),
                    chainId: this.chainId,
                    nonce: await nonce
                }
    
                const result = await this.issuerContract.functions.charge(
                    tokenAddress,
                    txParams
                )
                const receipt = await this.provider.getTransactionReceipt(result.hash || '')
                if (receipt.status) {
                    return result
                } else {
                    throw new Error('Something went wrong \n txHash: ' + result.hash || '')
                }
            }
        } catch (error) {
            throw error
        }
    }

    async getTokensTomoZ () {
        return this.issuerContract.functions.tokens()
            .then(data => data)
            .catch(error => error)
    }

    async getTokensTomoX () {
        return this.tomoXContract.functions.tokens()
            .then(data => data)
            .catch(error => error)
    }

    async isAppliedTomoX (address) {
        try {
            const list = await this.getTokensTomoX()
            if (list && list.length > 0) {
                const lowerCaseArr = list.map(m => m.toLowerCase())
                if (lowerCaseArr.indexOf(address.toLowerCase()) > -1) {
                    return true
                }
            }
            return false
        } catch (error) {
            throw error
        }
    }

    async isAppliedTomoZ (address) {
        try {
            const list = await this.getTokensTomoZ()
            if (list && list.length > 0) {
                const lowerCaseArr = list.map(m => m.toLowerCase())
                if (lowerCaseArr.indexOf(address.toLowerCase()) > -1) {
                    return true
                }
            }
            return false
        } catch (error) {
            throw error
        }
    }

    async applyTomoZ ({ tokenAddress, amount }) {
        try {
            if (amount < 10) {
                throw new Error('Minimum of depositing is 10 TOMO')
            }
            const isAppliedTomoZ = await this.isAppliedTomoZ(tokenAddress)

            if (isAppliedTomoZ) {
                throw new Error('This token have already applied to TomoZ')
            } else {
                const depAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
                const nonce = this.provider.getTransactionCount(this.coinbase)
                const gasPrice = this.provider.getGasPrice()
                const txParams = {
                    value: ethers.utils.hexlify(ethers.utils.bigNumberify(depAmountBN)),
                    gasLimit: ethers.utils.hexlify(this.gasLimit),
                    gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(await gasPrice)),
                    chainId: this.chainId,
                    nonce: await nonce
                }

                const result = await this.issuerContract.functions.apply(
                    tokenAddress,
                    txParams
                )
                return result
            }
        } catch (error) {
            throw error
        }
    }

    async applyTomoX ({ tokenAddress, amount, nonce }) {
        try {
            if (amount < 1000) {
                throw new Error('You need to pay 1000 TOMO as TomoX protocol listing fee')
            }
            const isAppliedTomoX = await this.isAppliedTomoX(tokenAddress)

            if (isAppliedTomoX) {
                throw new Error('This token have already applied to TomoX')
            } else {
                const depAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
                nonce = nonce || this.provider.getTransactionCount(this.coinbase)
                const gasPrice = this.provider.getGasPrice()
                const txParams = {
                    value: ethers.utils.hexlify(ethers.utils.bigNumberify(depAmountBN)),
                    gasLimit: ethers.utils.hexlify(this.gasLimit),
                    gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(await gasPrice)),
                    chainId: this.chainId,
                    nonce: nonce
                }

                const result = await this.tomoXContract.functions.apply(
                    tokenAddress,
                    txParams
                )

                return result
            }
        } catch (error) {
            throw error
        }
    }

    async reissueToken({ tokenAddress, toAddress = this.coinbase, amount }) {
        try {
            const abi = getABI()

            const contract = new ethers.Contract(
                tokenAddress,
                await abi,
                this.wallet
            )

            const reissueAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
            const nonce = this.provider.getTransactionCount(this.coinbase)
            const gasPrice = this.provider.getGasPrice()
            const txParams = {
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(await gasPrice)),
                chainId: this.chainId,
                nonce: await nonce
            }

            const result = await contract.functions.mint(
                toAddress,
                ethers.utils.hexlify(ethers.utils.bigNumberify(reissueAmountBN)),
                txParams
            )

            const receipt = await this.provider.getTransactionReceipt(result.hash || '')

            if (receipt.status) {
                return result
            } else {
                throw new Error('Something went wrong \n txHash: ' + result.hash || '')
            }
        } catch (error) {
            throw error
        }
    }

    async burnToken({ tokenAddress , amount }) {
        try {
            const abi = getABI()

            const contract = new ethers.Contract(
                tokenAddress,
                await abi,
                this.wallet
            )

            const burnAmountBN = new BigNumber(amount).multipliedBy(10 ** 18).toString(10)
            const nonce = this.provider.getTransactionCount(this.coinbase)
            const gasPrice = this.provider.getGasPrice()
            const txParams = {
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                gasPrice: ethers.utils.hexlify(ethers.utils.bigNumberify(await gasPrice)),
                chainId: this.chainId,
                nonce: await nonce
            }

            const result = await contract.functions.burn(
                ethers.utils.hexlify(ethers.utils.bigNumberify(burnAmountBN)),
                txParams
            )

            const receipt = await this.provider.getTransactionReceipt(result.hash || '')

            if (receipt.status) {
                return result
            } else {
                throw new Error('Something went wrong \n txHash: ' + result.hash || '')
            }
        } catch (error) {
            throw error
        }
    }

    async balanceOf({ tokenAddress , userAddress }) {
        try {
            const abi = getABI()

            const contract = new ethers.Contract(
                tokenAddress,
                await abi,
                this.wallet
            )

            const decimals = await contract.functions.decimals()
            const balance = await contract.functions.balanceOf(userAddress || this.coinbase)

            return {
                balance: (new BigNumber(balance).dividedBy(10 ** decimals)).toString(10),
                balanceBig: (new BigNumber(balance)).toString(10)
            }

        } catch (error) {
            throw error
        }
    }

    async transfer({ tokenAddress, to, amount, nonce }) {
        try {
            const abi = getABI()

            const contract = new ethers.Contract(
                tokenAddress,
                await abi,
                this.wallet
            )

            const decimals = await contract.functions.decimals()
            const amountBN = new BigNumber(amount).multipliedBy(10 ** decimals).toString(10)
            nonce = nonce || await this.provider.getTransactionCount(this.coinbase)
            let txParams = {
                value: 0,
                gasPrice: ethers.utils.hexlify(250000000000000),
                gasLimit: ethers.utils.hexlify(this.gasLimit),
                chainId: this.chainId,
                nonce
            }

            const result = await contract.functions.transfer(
                to,
                ethers.utils.hexlify(ethers.utils.bigNumberify(amountBN)),
                txParams
            )
            return result

        } catch (error) {
            throw error
        }
    }

    async getTokenInformation(tokenAddress) {
        try {
            if (tokenAddress === '0x0000000000000000000000000000000000000001') {
                return {
                    name: 'TomoChain',
                    symbol: 'TOMO',
                    decimals: 18,
                    totalSupply: '100000000'
                }
            }
            const abi = getABI()

            const contract = new ethers.Contract(
                tokenAddress,
                await abi,
                this.wallet
            )

            let decimals = 0
            let name = ''
            let symbol = ''

            try {
                decimals = await contract.functions.decimals()
                name = await contract.functions.name()
                symbol = await contract.functions.symbol()
            } catch (e) {}

            const isAppliedTomoZ = await this.isAppliedTomoZ(tokenAddress)
            const isAppliedTomoX = await this.isAppliedTomoX(tokenAddress)
            let totalSupply = await contract.functions.totalSupply()
            totalSupply = (new BigNumber(totalSupply).dividedBy(10 ** decimals)).toString(10)

            return {
                name,
                symbol,
                decimals,
                totalSupply,
                isAppliedTomoZ,
                isAppliedTomoX
            }
        } catch (error) {
            throw error
        }
    }
}

module.exports = TomoZ
