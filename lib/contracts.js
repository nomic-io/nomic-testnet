let { utils } = require('wasm-contracts')
let { join } = require('path')
let { createHash } = require('crypto')

const FEE = 50

exports.deploy = async function deploy(wallet, contractPath, endowment) {
  contractPath = join(process.cwd(), contractPath)

  let code = await utils.compile(contractPath)
  let creationOutput = utils.buildContractCreationTxOutput({
    endowment: endowment * 1e8 - FEE,
    code
  })
  let feeOutput = {
    type: 'fee',
    amount: FEE
  }
  let contractAddress = createHash('sha256')
    .update(code)
    .digest('base64')
  let result = await wallet.send([creationOutput, feeOutput])
  return { contractAddress, result }
}
