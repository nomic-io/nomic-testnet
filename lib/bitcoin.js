let { randomBytes } = require('crypto')
const DUMMY_BTC_ADDRESS = 'n4VQ5YdHf7hLQ2gWQYYrcxoE5B7nWuDFNF'
const DUMMY_UTXO = {}

/**
 * generate a bitcoin address from
 * a private key (32-byte buffer)
 */

exports.deriveBtcAddress = function(privKey) {
  return DUMMY_BTC_ADDRESS
}

/**
 * fetch all unspent transaction outputs that pay
 * to btcAddress.
 *
 * returns a promise that resolves once there's
 * at least one UTXO for this address.
 */

exports.fetchUTXOs = function(btcAddress) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve([DUMMY_UTXO])
    }, 10000)
  })
}

/**
 * send bitcoin transaction to peers.
 * resolves once we know the tx has been relayed
 */

exports.broadcastTx = function(btcTx) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, 3000)
  })
}

/**
 * create the bitcoin transaction that spends from
 * the intermediate address to give the signatories
 * control of the funds.
 *
 * validatorsMap: the one that’s available to lotion handlers
 * signatoryKeys: map of validatorkey : generated secp public key
 * coinsAddress: the `coins` address that should be credited with the deposited coins
 * depositTransactionUTXOs: from fetchUTXOs
 *
 * returns a bitcoin transaction which can be immediately broadcasted.
 */

exports.createDepositTx = function(
  privateKey,
  validatorsMap,
  signatoryKeys,
  coinsAddress,
  depositTransactionUTXOs
) {
  let btcTx = {}

  return btcTx
}
