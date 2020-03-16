
const ethers = require('ethers')
const request = require('request')
const urljoin = require('url-join');
const BigNumber = require('bignumber.js')
const WebSocket = require('ws')

class POSVJS {
    constructor (
        endpoint = 'http://localhost:8545',
        pkey = '' // sample
    ) {
        this.endpoint = endpoint
        if (!pkey) {
            let randomWallet = ethers.Wallet.createRandom()
            pkey = randomWallet.privateKey
        }
        this.wallet = new ethers.Wallet(pkey)
        this.coinbase = this.wallet.address
    }

    stake ({amount, node}) {
    }
}

module.exports = POSVJS
