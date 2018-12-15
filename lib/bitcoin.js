const { randomBytes } = require('crypto')
const bitcoin = require('bitcoinjs-lib')
const { PeerGroup } = require('bitcoin-net')
const Inventory = require('bitcoin-inventory')
const Filter = require('bitcoin-filter')
const protocol = require('bitcoin-protocol')
const params = require('webcoin-bitcoin-testnet')
const createHash = require('create-hash')
const { createDepositOutput } = require('bitcoin-peg')

const encodeTx = protocol.types.transaction.encode

function deriveBtcAddress(privateKey) {
  let keyPair = bitcoin.ECPair.fromPrivateKey(privateKey)
  let address = bitcoin.payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: bitcoin.networks.testnet // TODO: configurable
  })
  return address.address
}

function fetchUTXOs(address) {
  return new Promise((resolve, reject) => {
    let p2pkh = bitcoin.payments.p2pkh({
      address,
      network: bitcoin.networks.testnet // TODO: configurable
    })

    // connect to network to listen for txs
    let peers = PeerGroup(params.net) // TODO: configurable params
    let inventory = Inventory(peers)

    // filter by pubkey hash
    let filter = Filter(peers)
    filter.add(p2pkh.hash)

    peers.connect()

    // handle errrors
    peers.on('error', reject)
    inventory.on('error', reject)

    // TODO: search through recent block history

    // TODO: wait for relay from multiple peers?
    inventory.on('tx', tx => {
      peers.close()

      let txid = getTxHash(tx)
      let utxos = []
      let vout = 0
      for (let output of tx.outs) {
        if (output.script.equals(p2pkh.output)) {
          let { value } = output
          utxos.push({ txid, vout, value })
        }
        vout += 1
      }

      if (utxos.length > 0) {
        resolve(utxos)
      }
    })
  })
}

function broadcastTx(tx) {
  return new Promise((resolve, reject) => {
    // connect to network to listen for txs
    let broadcastPeers = PeerGroup(params.net) // TODO: configurable params
    let listenPeers = PeerGroup(params.net, { peerOpts: { relay: true } }) // TODO: configurable params
    let inventory = Inventory(broadcastPeers)
    broadcastPeers.connect()
    listenPeers.connect()

    // handle errrors
    broadcastPeers.on('error', reject)
    listenPeers.on('error', reject)
    inventory.on('error', reject)

    let broadcast = false
    let interval = setInterval(() => {
      if (broadcastPeers.peers.length < 7) return
      if (listenPeers.peers.length < 7) return
      inventory.broadcast(tx)
    }, 3000)

    // count how many peers relay our tx back to us so we know they liked it
    let relayCount = 0
    let txid = getTxHash(tx)
    listenPeers.on('inv', inv => {
      let isOurTx = false
      for (let { hash } of inv) {
        if (hash.equals(txid)) {
          isOurTx = true
          break
        }
      }

      if (!isOurTx) return
      relayCount += 1
      if (relayCount < 4) return

      // 4 people relayed it back to us, we're done!
      clearInterval(interval)
      listenPeers.close()
      broadcastPeers.close()
      resolve()
    })
  })
}

function createDepositTx(
  privateKey,
  validators,
  signatoryKeys,
  coinsAddress,
  utxos
) {
  let txb = new bitcoin.TransactionBuilder()

  // add the utxos as inputs
  let amount = 0
  for (let utxo of utxos) {
    txb.addInput(utxo.txid, utxo.vout)
    amount += utxo.value
    // TODO: amount overflow check
  }

  // TODO: fee calculation
  // TODO: subtract fee from amount
  amount -= 50000

  // output that pays to the signatory set
  let depositOutput = createDepositOutput(validators, signatoryKeys)
  txb.addOutput(depositOutput, amount)

  // output that commits to a destination address on the peg chain
  let addressOutput = bitcoin.payments.embed({
    data: [coinsAddress],
    network: bitcoin.networks.testnet // TODO
  }).output
  txb.addOutput(addressOutput, 0)

  // sign the inputs
  let priv = bitcoin.ECPair.fromPrivateKey(privateKey)
  for (let i = 0; i < utxos.length; i++) {
    txb.sign(i, priv)
  }

  // return the tx object
  return txb.build()
}

function getTxHash(tx) {
  let txBytes = encodeTx(tx)
  return sha256(sha256(txBytes))
}

function sha256(data) {
  return createHash('sha256')
    .update(data)
    .digest()
}

module.exports = {
  createDepositTx,
  deriveBtcAddress,
  fetchUTXOs,
  broadcastTx,
  getTxHash
}

exports.createDepositTx = createDepositTx