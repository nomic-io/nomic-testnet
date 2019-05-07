let lotion = require('lotion')
let bitcoinPeg = require('bitcoin-peg')
let contracts = require('lotion-contracts')
let staking = require('./staking.js')
let coins = require('coins')
let fs = require('fs')
let { get } = require('axios')
let diffy = require('diffy')()
let trim = require('diffy/trim')
let util = require('util')

const devMode = process.env.NODE_ENV === 'dev'

let peers = []
if (process.env.SEED_NODE) {
  peers.push(process.env.SEED_NODE)
}
let rpcPort = process.env.RPC_PORT || 1338

let keyPath, genesisPath
if (devMode) {
  keyPath = require.resolve('./dev-privatekey.json')
  genesisPath = require.resolve('./dev-genesis.json')
} else {
  genesisPath = require.resolve('./genesis.json')
  keyPath = fs.existsSync('./privkey.json') ? './privkey.json' : null
}

let app = lotion({
  peers,
  keyPath,
  genesisPath,
  rpcPort,
  p2pPort: 1337,
  logTendermint: false,
  discovery: false
})

const trustedHeader = {
  version: 1073676288,
  prevHash: Buffer.from(
    'a82fd47f65fc74d5ff947c71991c9cc4253ef7cd01e62dd6a700000000000000',
    'hex'
  ),
  merkleRoot: Buffer.from(
    '07e9687977173526285defcdcc92f57defea0bd2b5236711f04565cf44daf454',
    'hex'
  ),
  timestamp: 1553416509,
  bits: 436286314,
  nonce: 2223907393,
  height: 1485792
}

app.use('bitcoin', bitcoinPeg(trustedHeader, 'pbtc'))

app.use(
  'pbtc',
  coins({
    initialBalances: {
      '4C2tiCHRkdnC1VAwGowvG2CTQr5kReJ3y': 1e9,
      H7JKepgrCSXecWFGKsToRKkzofpynZfnx: 1e9
    },
    handlers: {
      bitcoin: bitcoinPeg.coinsHandler('bitcoin'),
      contract: contracts()
      // stake: staking()
    },
    minFee: 50
  })
)

if (devMode) {
  app.useBlock(function(state, context) {
    diffy.render(function() {
      return trim(`
      ============================================
      Context
      
      ${util.inspect(context)}
      ============================================      
      State
      
      ${util.inspect(state.pbtc)}
      ============================================`)
    })
  })
}

async function main() {
  let appInfo = await app.start()

  startWatchdog(appInfo.ports.rpc)
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
