let lotion = require('lotion')
let coins = require('coins')
let fs = require('fs')

let app = lotion({
  genesisPath: './genesis.json',
  keyPath: fs.existsSync('./privkey.json') ? './privkey.json' : null
})

app.use(
  coins({
    initialBalances: {
      JvP4JbpiWUUFgDVfX2f36wgi1wjDnVwzu: 10000,
      '4C2tiCHRkdnC1VAwGowvG2CTQr5kReJ3y': 10000
    }
  })
)

app.useBlock(function(state, info) {
  state.pegInfo = {
    validators: info.validators,
    signatories: {}
  }
})

async function main() {
  let { GCI } = await app.start()
}

main()
