let argv = process.argv.slice(2)
let { connect } = require('lotion')
let RPCClient = require('bitcoin-core')
let Relay = require('bitcoin-peg').relay.Relay

async function doRelayStep() {
  try {
    console.log('doing relay step..')
    console.log('relay:')
    console.log(Relay)
    let bitcoindRpcPort = Number(argv[0])
    let genesisPath = argv[1]
    let lotionRpcSeed = argv[2]
    console.log('connecting rpc on port ' + bitcoindRpcPort)
    let rpc = new RPCClient({
      network: 'testnet',
      port: bitcoindRpcPort,
      // TODO: secure rpc authentication
      username: 'foo',
      password: 'j1DuzF7QRUp-iSXjgewO9T_WT1Qgrtz_XWOHCMn_O-Y='
    })

    // Construct lotion light client
    let lightClient = await connect(
      null,
      {
        genesis: require(genesisPath),
        nodes: [lotionRpcSeed]
      }
    )
    // let lightClient = await connect(31337)

    let relay = new Relay({
      bitcoinRPC: rpc,
      lotionLightClient: lightClient
    })
    console.log(relay.step)
    await relay.step()
  } catch (e) {
    console.log(e)
  } finally {
    process.exit()
  }
}
doRelayStep()
