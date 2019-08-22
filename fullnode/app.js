let lotion = require('lotion')
let bitcoinPeg = require('bitcoin-peg')
let staking = require('staking')
let { join } = require('path')
let coins = require('coins')
let { get } = require('axios')
let clauses = require('clauses')
let execa = require('execa')
let startRelayer = require('./relay.js')

let config = process.env.CONFIG
  ? JSON.parse(process.env.CONFIG)
  : require('../config.js')

let app = lotion({
  peers: config.fullNode.seeds,
  keyPath: config.fullNode.keyPath,
  genesisPath: config.genesisPath,
  rpcPort: config.fullNode.rpcPort,
  p2pPort: config.fullNode.p2pPort,
  logTendermint: false,
  discovery: false
})

const trustedHeader = {
  height: 1574496,
  version: 1073676288,
  prevHash: Buffer.from(
    '95ca0f2b97bb3a51a01685d0d678edf09e543924ba3fe85d5200000000000000',
    'hex'
  ),
  merkleRoot: Buffer.from(
    '708601f5f9b68b75321de9ceeab3426daca17313cdc1fb964033b285789a2f1c',
    'hex'
  ),
  timestamp: 1565789713,
  bits: 436336433,
  nonce: 1552477045
}

app.use(clauses)

app.use('bitcoin', bitcoinPeg(trustedHeader, 'pbtc', 'testnet'))

app.use(
  'pbtc',
  coins({
    initialBalances: {
      BUK3xqcqs5cVvdc9hP4HYgqEBZ1vtPJWj: 1e9,
      JvP4JbpiWUUFgDVfX2f36wgi1wjDnVwzu: 1e9
    },
    handlers: {
      bitcoin: bitcoinPeg.coinsHandler('bitcoin'),
      stake: staking()
    },
    minFee: 50
  })
)

async function main() {
  let appInfo = await app.start()
  /**
   * Start relayer process
   */
  let relayer = await startRelayer(config.genesisPath, appInfo.ports.rpc)

  /**
   * Start bitcoin signatory process
   */
  // startSignatory(
  //   join(appInfo.home, 'config', 'genesis.json'),
  //   join(appInfo.home, 'config', 'priv_validator_key.json')
  // )
  // startWatchdog(appInfo.ports.rpc)
}

process.on('unhandledRejection', e => {
  console.log('rejections hate him')
  console.log(e)
})
process.on('uncaughtException', e => {
  console.log('exceptions hate him')
  console.log(e)
})

main().catch(err => {
  console.error(err.stack)
  process.exit(1)
})

async function startSignatory(genesisPath, privKeyPath) {
  while (true) {
    try {
      let signatoryProcess = execa('node', [
        require.resolve('../node_modules/bitcoin-peg/bin/signatory.js'),
        genesisPath,
        privKeyPath
      ])

      signatoryProcess.stdout.resume()
      signatoryProcess.stderr.resume()

      await signatoryProcess
      console.log('signatory process started')
    } catch (e) {
      console.log('error starting signatory:')
      console.log(e)
    }
    await delay(5000)
  }
}

function delay(ms = 1000) {
  return new Promise(resolve => {
    setTimeout(function() {
      resolve()
    }, ms)
  })
}

function startWatchdog(rpcPort) {
  // kills process if the RPC is hanging
  setInterval(() => {
    get(`http://localhost:${rpcPort}/status`, {
      timeout: 10 * 1000
    }).catch(err => {
      console.error('failed to GET /status from RPC')
      process.exit(1)
    })
  }, 2 * 60 * 1000)
}
