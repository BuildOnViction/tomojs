const BigNumber = require('bignumber.js')
const ethers = require('ethers')

const createOrderHash = (order) => {
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

const createLendingOrderHash = (order) =>{
    if (order.type === 'MO') {
        if (order.side === 'BORROW') {
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
                    'string',
                    'uint256',
                    'uint256'
                ],
                [
                    order.relayerAddress,
                    order.userAddress,
                    order.collateralToken,
                    order.lendingToken,
                    order.quantity,
                    order.term,
                    order.side,
                    order.status,
                    order.type,
                    order.nonce,
                    order.autoTopUp
                ],
            )
        }
        return ethers.utils.solidityKeccak256(
            [
                'bytes',
                'bytes',
                'bytes',
                'uint256',
                'uint256',
                'string',
                'string',
                'string',
                'uint256',
            ],
            [
                order.relayerAddress,
                order.userAddress,
                order.lendingToken,
                order.quantity,
                order.term,
                order.side,
                order.status,
                order.type,
                order.nonce
            ],
        )
    }
    if (order.side === 'BORROW') {
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
                'string',
                'uint256',
                'uint256'
            ],
            [
                order.relayerAddress,
                order.userAddress,
                order.collateralToken,
                order.lendingToken,
                order.quantity,
                order.term,
                order.interest,
                order.side,
                order.status,
                order.type,
                order.nonce,
                order.autoTopUp
            ],
        )
    }
    return ethers.utils.solidityKeccak256(
        [
            'bytes',
            'bytes',
            'bytes',
            'uint256',
            'uint256',
            'uint256',
            'string',
            'string',
            'string',
            'uint256',
        ],
        [
            order.relayerAddress,
            order.userAddress,
            order.lendingToken,
            order.quantity,
            order.term,
            order.interest,
            order.side,
            order.status,
            order.type,
            order.nonce
        ],
    )
}

const bigToHex = (b) => {
    return '0x' + (new BigNumber(b)).toString(16)
}

module.exports = {
    bigToHex,
    createOrderHash,
    createLendingOrderHash
}

