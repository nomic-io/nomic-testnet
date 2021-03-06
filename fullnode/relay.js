let bitcoind = require('bitcoind')
let execa = require('execa')
let getPort = require('get-port')

module.exports = async function startRelayer(genesisPath, lotionRpcPort) {
  let rpcport = await getPort()
  let node = bitcoind({
    rpcport,
    // TODO: secure rpc auth
    rpcauth:
      'foo:e1fcea9fb59df8b0388f251984fe85$26431097d48c5b6047df8dee64f387f63835c01a2a463728ad75087d0133b8e6',
    testnet: true
  })
  await node.started()

  // relay.step() happens in an ephemeral child process.
  while (true) {
    try {
      let relayerProcess = execa(
        'node',
        [
          require.resolve('./lib/relay-step.js'),
          rpcport,
          genesisPath,
          'ws://localhost:' + lotionRpcPort
        ],
        { timeout: 60 * 1000 }
      )
      relayerProcess.stdout.on('data', function(chunk) {
        console.log(chunk.toString())
      })
      relayerProcess.stderr.on('data', function(chunk) {
        console.log(chunk.toString())
      })
      await relayerProcess
      await sleep(20)
    } catch (e) {
      if (e && e.signal && e.signal === 'SIGTERM') {
        // Relayer timed out
      } else {
        console.log('relayer error:')
        console.log(e)
      }
    }
  }
}

function sleep(seconds = 20) {
  return new Promise((resolve, reject) => {
    setTimeout(function() {
      resolve()
    }, seconds * 1000)
  })
}
