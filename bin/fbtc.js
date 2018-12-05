#!/usr/bin/env node

let argv = process.argv.slice(2)

let os = require('os')
let fs = require('fs')
let { join } = require('path')
let { randomBytes } = require('crypto')
let secp256k1 = require('secp256k1')
let coins = require('coins')
let connect = require('lotion-connect')
let ora = require('ora')
let bitcoin = require('../lib/bitcoin.js')

const TESTNET_GCI =
  'fb880e70a53ca462c791b0ecef8b17bd0e091a52f42747319bb35b9cc8dc9a71'

const USAGE = `
Usage: fbtc [command]

  Commands:
    
    balance                       Display your fbtc address and balance
    send      [address] [amount]  Send deposited coins to another address
    deposit                       Generate and display Bitcoin deposit address
    withdraw  [address] [amount]  Withdraw fbtc to a Bitcoin address`

async function main() {
  if (argv.length === 0) {
    console.log(USAGE)
    process.exit()
  }

  let gci = process.env.gci || TESTNET_GCI
  let client = await connect(gci)
  let wallet = loadWallet(client)

  let cmd = argv[0]
  if (cmd === 'balance' && argv.length === 1) {
    console.log(`
Your address: ${wallet.address()}
Your balance: ${await wallet.balance()}`)
    process.exit()
  } else if (cmd === 'send' && argv.length === 3) {
    let recipientCoinsAddress = argv[1]
    let amount = Number(argv[2])
    try {
      let result = await wallet.send(recipientCoinsAddress, amount)
      if (result.check_tx.code) {
        throw new Error(result.check_tx.log)
      }
      if (result.deliver_tx.code) {
        throw new Error(result.deliver_tx.log)
      }
      process.exit()
    } catch (e) {
      console.log(e.message)
      process.exit(1)
    }
  } else if (cmd === 'deposit' && argv.length === 1) {
    let DUMMY_PRIVKEY = randomBytes(32)
    let btcDepositAddress = bitcoin.deriveBtcAddress(DUMMY_PRIVKEY)
    // save private key in case user exits before deposit completes

    let spinner = ora(
      `Waiting for Bitcoin deposit to ${btcDepositAddress}`
    ).start()
    await doDepositProcess(btcDepositAddress)
  } else if (cmd === 'withdraw' && argv.length === 3) {
    let recipientBtcAddress = argv[1]
    let amount = Number(argv[2])
    process.exit()
  } else {
    console.log(USAGE)
    process.exit()
  }
}

main()

async function doDepositProcess(
  privateKey,
  intermediateBtcAddress,
  client,
  coinsWallet
) {
  // get validators and signatory keys
  let { validators, signatories } = await getPeggingInfo(client)
  // wait for a deposit to the intermediate btc address
  let depositUTXOs = await bitcoin.fetchUTXOs(intermediateBtcAddress)
  // build intermediate address -> signatories transaction
  let depositTransaction = bitcoin.createDepositTx(
    intermediateBtcAddress.privateKey,
    validators,
    signatories,
    coinsWallet.address(),
    depositUTXOs
  )
  await bitcoin.broadcastTx(depositTransaction)
}

async function getPeggingInfo(client) {
  return await client.state.pegInfo
}

function generateSecpPrivateKey() {
  let privKey = randomBytes(32)
  while (!secp256k1.privateKeyVerify(privKey)) {
    privKey = randomBytes(32)
  }
  return privKey
}

function loadWallet(client) {
  let privKey
  let path = join(os.homedir(), '.coins')
  if (!fs.existsSync(path)) {
    privKey = generateSecpPrivateKey()
  } else {
    privKey = Buffer.from(fs.readFileSync(path, 'utf8'), 'hex')
  }

  return coins.wallet(privKey, client)
}
