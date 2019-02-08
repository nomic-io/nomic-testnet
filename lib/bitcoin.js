const { randomBytes } = require('crypto')
const bitcoin = require('bitcoinjs-lib')
const { PeerGroup } = require('bitcoin-net')
const Inventory = require('bitcoin-inventory')
const Filter = require('bitcoin-filter')
const protocol = require('bitcoin-protocol')
const params = require('webcoin-bitcoin-testnet')
const createHash = require('create-hash')
const { createDepositOutput } = require('bitcoin-peg')
const { isDepositTx } = require('bitcoin-peg').relay
const SPVNode = require('webcoin')

const encodeTx = protocol.types.transaction.encode

function deriveP2pkh(privateKey) {
  let keyPair = bitcoin.ECPair.fromPrivateKey(privateKey)
  return bitcoin.payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: bitcoin.networks.testnet // TODO: configurable
  })
}

async function fetchUTXOs(p2pkh) {
  let node = SPVNode({ network: 'testnet' })
  node.filter(p2pkh.hash)
  node.filter(p2pkh.pubkey)
  node.start()

  let utxos = await node.getUtxos({ scanRange: 20 })
  node.close()

  return utxos
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
      listenPeers.send('mempool')
    }, 3000)

    // count how many peers relay our tx back to us so we know they liked it
    let relayCount = 0
    let txid = getNonWitnessTxHash(tx)
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

function getNonWitnessTxHash(tx) {
  // delete witnesses
  tx = Object.assign({}, tx)
  tx.ins = tx.ins.map((input) => {
    input = Object.assign({}, input)
    delete input.witness
    return input
  })
  return getTxHash(tx)
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
  deriveP2pkh,
  fetchUTXOs,
  broadcastTx,
  getTxHash,
  waitForConfirmation,
  createOutputScript
}
