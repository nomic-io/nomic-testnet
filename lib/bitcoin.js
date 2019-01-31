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

function createOutputScript(address) {
  let outputScript = bitcoin.address.toOutputScript(
    address,
    bitcoin.networks.testnet
  ) // TODO: update network
  return outputScript
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
      if (relayCount < 3) return

      // 4 people relayed it back to us, we're done!
      clearInterval(interval)
      listenPeers.close()
      broadcastPeers.close()
      resolve()
    })
  })
}

function signTx(tx, privateKey) {
  let txb = bitcoin.TransactionBuilder.fromTransaction(tx)
  let priv = bitcoin.ECPair.fromPrivateKey(privateKey)

  for (let i = 0; i < tx.ins.length; i++) {
    txb.sign(i, priv)
  }

  return txb.build()
}

function waitForConfirmation(txid) {
  // TODO: don't resolve if txid is not in block
  return new Promise((resolve, reject) => {
    // connect to network to listen for txs
    let peers = PeerGroup(params.net) // TODO: configurable params

    peers.connect()

    // handle errrors
    peers.on('error', reject)

    peers.on('inv', function(items) {
      let foundABlock = false
      items.forEach(function(item) {
        if (item.type === 2) foundABlock = true
      })
      if (foundABlock) {
        resolve()
        peers.close()
      }
    })
  })
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
  signTx,
  deriveBtcAddress,
  fetchUTXOs,
  broadcastTx,
  getTxHash,
  waitForConfirmation,
  createOutputScript
}
