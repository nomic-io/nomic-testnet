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
  version: 1073676288,
  prevHash: Buffer.from('c28aaf47e2574db86bc2daf2a10e38d52f738ad02f00f203e900000000000000', 'hex'),
  merkleRoot: Buffer.from('bea48abbc1ab99fd497c24209730aac7db267e4f2d6cb1977656c91da2b7d282', 'hex'),
  timestamp: 1549280514,
  bits: 436283074,
  nonce: 3607464172,
  height: 1455552
}

app.use('bitcoin', bitcoinPeg(trustedHeader, 'pbtc'))

app.use(
  'pbtc',
  coins({
    handlers: {
      bitcoin: bitcoinPeg.coinsHandler('bitcoin')
    },
    minFee: 50
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
