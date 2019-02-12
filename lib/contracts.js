let { utils } = require('wasm-contracts')
let { join } = require('path')

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
  console.log('outputs:')
  console.log([creationOutput, feeOutput])
  let result = await wallet.send([creationOutput, feeOutput])
  console.log(result)
  return result
}
