/**
 * Outputs a recent bitcoin (testnet) header to use in the `bitcoin-peg` initializer.
 */

let bitcoind = require('bitcoind')
let RPCClient = require('bitcoin-core')
let getPort = require('get-port')
async function main() {
  let rpcport = await getPort()

  let node = bitcoind({
    rpcport,
    // TODO: secure rpc auth
    rpcauth:
      'foo:e1fcea9fb59df8b0388f251984fe85$26431097d48c5b6047df8dee64f387f63835c01a2a463728ad75087d0133b8e6',
    testnet: true
  })
  await node.started()

  let rpc = new RPCClient({
    network: 'testnet',
    port: rpcport,
    username: 'foo',
    password: 'j1DuzF7QRUp-iSXjgewO9T_WT1Qgrtz_XWOHCMn_O-Y='
  })
  let bestHash = await rpc.getBestBlockHash()
  let bestHeader = await rpc.getBlockHeader(bestHash)
  while (bestHeader.height % 2016 !== 0) {
    bestHeader = await rpc.getBlockHeader(bestHeader.previousblockhash)
  }
  console.log(formatHeader(bestHeader))
}

function formatHeader(header) {
  return {
    height: Number(header.height),
    version: Number(header.version),
    prevHash: (header.previousblockhash
      ? Buffer.from(header.previousblockhash, 'hex').reverse()
      : Buffer.alloc(32)
    ).toString('hex'),
    merkleRoot: Buffer.from(header.merkleroot, 'hex')
      .reverse()
      .toString('hex'),
    timestamp: Number(header.time),
    bits: parseInt(header.bits, 16),
    nonce: Number(header.nonce)
  }
}
main()
