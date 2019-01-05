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
let { relayDeposit, buildDisbursalTransaction } = require('bitcoin-peg').relay
let base58 = require('bs58check')

const TESTNET_GCI =
  '58bae8263f5ac4f1a3c93c2876538054fd8727d44504c30973a08ef82c64424b'

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
    process.exit(1)
  }

  let gci = process.env.gci || TESTNET_GCI
  let client = await connect(
    gci,
    { nodes: ['ws://pbtc.mappum.com:1338', 'ws://pbtc.judd.co:1338'] }
  )
  let coinsWallet = loadWallet(client)

  let cmd = argv[0]
  if (cmd === 'balance' && argv.length === 1) {
    console.log(`
Your address: ${coinsWallet.address()}
Your balance: ${(await coinsWallet.balance()) / 1e8} pbtc`)
    process.exit()
  } else if (cmd === 'send' && argv.length === 3) {
    let recipientCoinsAddress = argv[1]
    let amount = Number(argv[2]) * 1e8
    try {
      let result = await coinsWallet.send(recipientCoinsAddress, amount)
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
    let depositPrivateKey = generateSecpPrivateKey()
    let btcDepositAddress = bitcoin.deriveBtcAddress(depositPrivateKey)

    console.log(`Deposit address: ${btcDepositAddress}\n`)
    // change it to a check mark
    await doDepositProcess(
      depositPrivateKey,
      btcDepositAddress,
      client,
      coinsWallet
    )
    process.exit()
  } else if (cmd === 'withdraw' && argv.length === 3) {
    let recipientBtcAddress = argv[1]
    let amount = Number(argv[2]) * 1e8

    await doWithdrawProcess(client, coinsWallet, recipientBtcAddress, amount)

    process.exit(0)
  } else {
    console.log(USAGE)
    process.exit(1)
  }
}

main()

async function doDepositProcess(
  depositPrivateKey,
  intermediateBtcAddress,
  client,
  coinsWallet
) {
  let spinner = ora(`Waiting for deposit...`).start()
  // get validators and signatory keys
  let { validators, signatories } = await getPeggingInfo(client)
  // wait for a deposit to the intermediate btc address
  let depositUTXOs = await bitcoin.fetchUTXOs(intermediateBtcAddress)
  let depositAmount = depositUTXOs[0].value / 1e8

  if (depositUTXOs[0].value < 20000) {
    spinner.fail('Deposit amount must be greater than .0002 Bitcoin')
    process.exit()
  }
  spinner.succeed(`Detected incoming deposit of ${depositAmount} Bitcoin.`)
  let spinner2 = ora('Broadcasting deposit transaction...').start()

  // build intermediate address -> signatories transaction
  let depositTransaction = bitcoin.createDepositTx(
    depositPrivateKey,
    validators,
    signatories,
    base58.decode(coinsWallet.address()),
    depositUTXOs
  )
  await bitcoin.broadcastTx(depositTransaction)
  let txHash = bitcoin.getTxHash(depositTransaction)
  let explorerLink = `https://live.blockcypher.com/btc-testnet/tx/${txHash
    .slice(0)
    .reverse()
    .toString('hex')}`
  spinner2.succeed(`Deposit transaction broadcasted. ${explorerLink}`)

  let spinner3 = ora(
    'Waiting for Bitcoin miners to mine a block (this might take a while)...'
  ).start()
  await bitcoin.waitForConfirmation(txHash)
  spinner3.succeed(`Deposit transaction confirmed.`)

  let spinner4 = ora('Relaying deposit to peg network...').start()
  txHash = bitcoin.getTxHash(depositTransaction)
  await relayDeposit(client, txHash)
  spinner4.succeed('Deposit succeeded.')

  console.log('\n\nCheck your balance with:')
  console.log('$ pbtc balance')
}

async function doWithdrawProcess(client, coinsWallet, address, amount) {
  let { validators, signatories } = await getPeggingInfo(client)

  let spinner = ora('Broadcasting withdrawal transaction...').start()
  let outputScript = bitcoin.createOutputScript(address)
  let res = await coinsWallet.send({
    type: 'bitcoin',
    amount,
    script: outputScript
  })

  if (res.check_tx.code || res.deliver_tx.code) {
    spinner.fail('Invalid withdrawal transaction')
    console.log(res)
    process.exit(1)
  }

  spinner.succeed('Broadcasted withdrawal transaction.')

  let spinner2 = ora(
    'Waiting for signatories to sign Bitcoin transaction...'
  ).start()

  // wait for signatories to sign a transaction with our output in it
  let signedTx
  waitForSignatures: while (true) {
    signedTx = await client.state.bitcoin.signedTx
    if (signedTx == null) {
      await sleep(500)
      continue
    }

    for (let output of signedTx.outputs) {
      if (output.amount === amount && output.script.equals(outputScript)) {
        break waitForSignatures
      }
    }
    await sleep(500)
  }
  spinner2.succeed('Bitcoin transaction signed.')

  let spinner3 = ora('Relaying transaction to Bitcoin network...').start()
  let tx = await buildDisbursalTransaction(signedTx, validators, signatories)
  await bitcoin.broadcastTx(tx)
  let withdrawalTxLink = `https://live.blockcypher.com/btc-testnet/tx/${tx.getId()}`
  spinner3.succeed(`Withdrawal succeeded. ${withdrawalTxLink}`)
}

async function getPeggingInfo(client) {
  let validators = {}
  client.validators.forEach(v => {
    validators[v.pub_key.value] = v.voting_power
  })

  let signatories = await client.state.bitcoin.signatoryKeys

  return { signatories, validators }
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

  return coins.wallet(privKey, client, { route: 'pbtc' })
}

function sleep(ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
