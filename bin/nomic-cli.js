#!/usr/bin/env node

let argv = process.argv.slice(2)

let os = require('os')
let fs = require('fs')
let { join, basename } = require('path')
let { randomBytes, createHash } = require('crypto')
let secp256k1 = require('secp256k1')
let coins = require('coins')
let connect = require('lotion-connect')
let ora = require('ora')
let bitcoin = require('../lib/bitcoin.js')
let peg = require('bitcoin-peg')
let { relayDeposit, buildDisbursalTransaction } = peg.relay
let base58 = require('bs58check')
let { bold, cyan, red } = require('chalk')
let Web8 = require('web8')
let execa = require('execa')
let getPort = require('get-port')
let browserify = require('browserify')
let diffy = require('diffy')()
let trim = require('diffy/trim')
let { RpcClient } = require('tendermint')
let ProgressBar = require('progress')

const CMD = basename(process.argv[1])

const TESTNET_GCI =
  '03c13f8701091afcb9338b7b0a4c4da5d6050da9c556c40942a68ffb437172e2'

const SYMBOL = 'NBTC'

const USAGE = `
Usage: ${CMD} [command]

  Commands:

    balance                       Display your ${SYMBOL} address and balance
    send      [address] [amount]  Send deposited coins to another address
    deposit                       Generate and display Bitcoin deposit address
    withdraw  [address] [amount]  Withdraw ${SYMBOL} to a Bitcoin address
    deploy    [path]    [amount]  Deploy a contract and endow it with ${SYMBOL}
    start                         Runs a full node on the Nomic testnet
    dev                           Start a local network for development
`

async function main() {
  if (argv.length === 0) {
    console.log(USAGE)
    process.exit(1)
  }

  let gci = process.env.gci || TESTNET_GCI
  let client = await connect(
    gci,
    {
      nodes: ['ws://134.209.50.224:1338'],
      genesis: require('./genesis.json')
    }
  )
  let coinsWallet = loadWallet(client)
  let web8 = await Web8()

  let cmd = argv[0]
  if (cmd === 'balance' && argv.length === 1) {
    console.log(`
${bold('YOUR ADDRESS:')} ${cyan(coinsWallet.address())}
${bold('YOUR BALANCE:')} ${cyan(
      (await coinsWallet.balance()) / 1e8
    )} ${SYMBOL}`)
    process.exit()
  } else if (cmd === 'send' && argv.length === 3) {
    let recipientCoinsAddress = argv[1]
    let amount = parseBtcAmount(argv[2])
    try {
      let result = await coinsWallet.send([
        { address: recipientCoinsAddress, amount },
        { type: 'fee', amount: 50 }
      ])
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
    let depositPrivateKey = sha256(coinsWallet.privkey)
    let p2pkh = bitcoin.deriveP2pkh(depositPrivateKey)
    let btcDepositAddress = p2pkh.address

    console.log(`
${bold('YOUR BITCOIN TESTNET DEPOSIT ADDRESS:')}
${cyan(btcDepositAddress)}

Send BTC to this address and it will be transferred to your account on the sidechain.
`)
    // change it to a check mark
    await doDepositProcess(depositPrivateKey, p2pkh, client, coinsWallet)
    process.exit()
  } else if (cmd === 'withdraw' && argv.length === 3) {
    let recipientBtcAddress = argv[1]
    let amount = parseBtcAmount(argv[2])

    await doWithdrawProcess(client, coinsWallet, recipientBtcAddress, amount)
    process.exit(0)
  } else if (cmd === 'deploy' && (argv.length === 2 || argv.length === 3)) {
    let contractPath = argv[1]
    let amount = argv[2] ? parseBtcAmount(argv[2]) : 0
    await doDeployProcess(web8, contractPath, amount)
    process.exit()
  } else if (cmd === 'stake' && argv.length === 3) {
    let validatorAddress = argv[1]
    let stakeAmount = parseBtcAmount(argv[2])
    await doStake(coinsWallet, validatorAddress, stakeAmount)
    process.exit()
  } else if (cmd === 'start') {
    /**
     * Start full node
     */
    let privKeyPath
    if (argv[1]) {
      privKeyPath = join(process.cwd(), argv[1])
    }
    startFullNode(client, privKeyPath)
  } else if (cmd === 'dev') {
    startDevNode()
  } else {
    console.log(USAGE)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('ERROR:', err.stack)
  process.exit(1)
})

async function doStake(coinsWallet, validatorPubKey, stakeAmount) {
  let stakeOutput = {
    type: 'stake',
    amount: stakeAmount,
    validatorPubkey: validatorPubKey,
    address: coinsWallet.address(),
    bond: true
  }

  console.log(
    await coinsWallet.send([stakeOutput, { type: 'fee', amount: 50 }])
  )
}

async function startDevNode() {
  let RPC_PORT = await getPort(26657)
  let fullNode = execa('node', [require.resolve('../fullnode/app.js')], {
    env: {
      RPC_PORT,
      NODE_ENV: 'dev'
    }
  })
  fullNode.stdout.pipe(process.stdout)
  fullNode.stderr.pipe(process.stderr)
}

async function startFullNode(lc, privKeyPath) {
  let { sync_info, node_info } = await lc.lightClient.rpc.status()
  let targetHeight = Number(sync_info.latest_block_height)
  const seedNode = `${node_info.id}@134.209.50.224:1337`
  let RPC_PORT = await getPort(26657)
  let fullNode = execa('node', [require.resolve('../fullnode/app.js')], {
    env: {
      RPC_PORT,
      SEED_NODE: seedNode,
      KEY_PATH: privKeyPath
    }
  })
  fullNode.stdout.pipe(process.stdout)
  fullNode.stderr.pipe(process.stderr)
  /**
   * Once full node has started, we can safely ignore light client errors.
   *
   * TODO: Close light client connection instead of swallowing errors.
   */
  lc.on('error', function() {})

  let rpc, bar
  setInterval(async function() {
    try {
      if (!rpc) {
        rpc = RpcClient('http://localhost:' + RPC_PORT)
      }
      if (!bar) {
        bar = new ProgressBar(
          '  syncing [:bar] :current/:total :percent :etas',
          {
            complete: '=',
            incomplete: '-',
            width: 40,
            total: targetHeight,
            clear: true
          }
        )
      }
      let status = await rpc.status()
      if (!bar.complete) {
        bar.tick(Number(status.sync_info.latest_block_height) - bar.curr)
      } else {
        diffy.render(function() {
          return trim(`
      Validator public key: ${status.validator_info.pub_key.value}
      Validator voting power: ${status.validator_info.voting_power}
      Latest block height: ${status.sync_info.latest_block_height}
      RPC server: http://localhost:${RPC_PORT}

      To gain voting power by staking coins, run:
      $ ${CMD} stake ${status.validator_info.pub_key.value} <amount>
      `)
        })
      }
    } catch (e) {}
  }, 1000)
}

async function doDepositProcess(depositPrivateKey, p2pkh, client, coinsWallet) {
  // get validators and signatory keys
  let { validators, signatories } = await getPeggingInfo(client)

  let spinner = ora(`Waiting for deposit...`).start()
  // wait for a deposit to the intermediate btc address
  let depositUTXOs = await bitcoin.fetchUTXOs(p2pkh)
  let sum = depositUTXOs.reduce((sum, utxo) => sum + utxo.value, 0)
  let depositAmount = sum / 1e8

  if (sum < 20000) {
    spinner.fail(red('Deposit amount must be at least 0.0002 BTC'))
    process.exit(1)
  }

  spinner.succeed(`Detected incoming deposit of ${cyan(depositAmount)} BTC`)
  let spinner2 = ora('Broadcasting deposit transaction...').start()

  // build intermediate address -> signatories transaction
  let depositTransaction = peg.deposit.createTx(
    validators,
    signatories,
    depositUTXOs,
    base58.decode(coinsWallet.address())
  )
  depositTransaction = bitcoin.signTx(depositTransaction, depositPrivateKey)
  await bitcoin.broadcastTx(depositTransaction)
  let txHash = bitcoin.getTxHash(depositTransaction)
  let explorerLink = `https://live.blockcypher.com/btc-testnet/tx/${txHash
    .slice(0)
    .reverse()
    .toString('hex')}`
  spinner2.succeed(`Deposit transaction broadcasted: ${cyan(explorerLink)}`)

  process.on('exit', code => {
    if (code === 0) return
    console.log(
      red(
        `An error occurred.\nDon't worry, your deposit is still going through.\nThe coins should show up in your wallet in a few minutes, check your balance with ${cyan(
          '`' + CMD + ' balance`'
        )}.`
      )
    )
    process.exit(1)
  })

  let spinner3 = ora(
    'Waiting for Bitcoin miners to mine a block (this might take a while)...'
  ).start()
  await bitcoin.waitForConfirmation(txHash)
  spinner3.succeed(`Deposit transaction confirmed`)

  let spinner4 = ora('Relaying deposit to peg network...').start()
  txHash = bitcoin.getTxHash(depositTransaction)
  await relayDeposit(client, txHash)
  spinner4.succeed('Deposit succeeded')

  console.log(bold('\n\nCheck your balance with:'))
  console.log(`$ ${CMD} balance`)
}

async function doWithdrawProcess(client, coinsWallet, address, amount) {
  let { validators, signatories } = await getPeggingInfo(client)

  let spinner = ora('Broadcasting withdrawal transaction...').start()
  let outputScript
  try {
    outputScript = bitcoin.createOutputScript(address)
  } catch (err) {
    spinner.fail(red('Invalid Bitcoin testnet address'))
    process.exit(1)
  }

  let res = await coinsWallet.send([
    {
      type: 'bitcoin',
      amount,
      script: outputScript
    },
    {
      type: 'fee',
      amount: 50
    }
  ])

  if (res.check_tx.code || res.deliver_tx.code) {
    spinner.fail(red('Invalid withdrawal transaction'))
    console.log(res)
    process.exit(1)
  }

  spinner.succeed('Broadcasted withdrawal transaction')

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
  spinner2.succeed('Bitcoin transaction signed')

  let spinner3 = ora('Relaying transaction to Bitcoin network...').start()
  let tx = await buildDisbursalTransaction(signedTx, validators, signatories)
  await bitcoin.broadcastTx(tx)
  let withdrawalTxLink = `https://live.blockcypher.com/btc-testnet/tx/${tx.getId()}`
  spinner3.succeed(`Withdrawal succeeded: ${cyan(withdrawalTxLink)}`)
}

async function doDeployProcess(web8, contractPath, amount) {
  let spinner = ora('Building contract...').start()
  let code = await bundleContract(contractPath)
  spinner.succeed('Built contract.')

  let spinner2 = ora('Deploying contract...').start()
  let result = await web8.createContract({ code, endowment: amount })
  spinner2.succeed('Deployed contract successfully.')

  console.log('\n\nContract address: ' + bold(result.contractAddress))
}

function bundleContract(contractPath) {
  return new Promise((resolve, reject) => {
    let b = browserify(contractPath, { node: true })
    b.bundle(function(err, code) {
      if (err) {
        throw new Error(err)
      }
      fs.writeFileSync('bundle.js', code.toString())
      resolve(
        'function require(){};let Module =' +
          code.toString() +
          ';module.exports = Module(1)'
      )
    })
  })
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
  let walletPath = join(os.homedir(), '.coins')
  if (!fs.existsSync(walletPath)) {
    privKey = generateSecpPrivateKey()
    fs.writeFileSync(walletPath, privKey.toString('hex'), 'utf8')
  } else {
    privKey = Buffer.from(fs.readFileSync(walletPath, 'utf8'), 'hex')
  }

  return coins.wallet(privKey, client, { route: 'pbtc' })
}

function sha256(data) {
  return createHash('sha256')
    .update(data)
    .digest()
}

function sleep(ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseBtcAmount(str) {
  return Math.round(Number(str) * 1e8)
}

process.removeAllListeners('uncaughtException')
process.on('uncaughtException', function(e) {
  console.log('error:')
  console.log(e)
})
