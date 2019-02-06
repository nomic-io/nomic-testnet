let lotion = require('lotion')
let bitcoinPeg = require('bitcoin-peg')
let coins = require('coins')
let fs = require('fs')

let app = lotion({
  genesisPath: './genesis.json',
  keyPath: fs.existsSync('./privkey.json') ? './privkey.json' : null,
  p2pPort: 1337,
  rpcPort: 1338,
  peers: []
})

const trustedHeader = {
  version: 1073733632,
  prevHash: Buffer.from(
    '0000000000000113d4262419a8aa3a4fe928c0ea81893a2d2ffee5258b2085d8',
    'hex'
  ).reverse(),
  merkleRoot: Buffer.from(
    'baa3bb3f4fb663bf6974831ff3d2c37479f471f1558447dfae92f146539f7d9f',
    'hex'
  ).reverse(),
  timestamp: 1544602833,
  bits: 0x1a015269,
  nonce: 3714016562,
  height: 1447488
}

app.use('bitcoin', bitcoinPeg(trustedHeader, 'pbtc'))

app.use(
  'pbtc',
  coins({
    handlers: {
      bitcoin: bitcoinPeg.coinsHandler('bitcoin')
    }
  })
)

async function main() {
  let appInfo = await app.start()
  console.log(appInfo)
}

process.on('unhandledRejection', e => {
  console.log('rejections hate him')
  console.log(e)
})
process.on('uncaughtException', e => {
  console.log('exceptions hate him')
  console.log(e)
})

main()
