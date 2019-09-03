module.exports = {
  // GCI: '201d5435eb10d700866a92f917159f222707d44ff34ac7da0394dccf74e315ef',
  GCI: null,
  genesisPath: require.resolve('./fullnode/dev-genesis.json'),
  fullNode: {
    rpcPort: 33000,
    p2pPort: 33001,
    seeds: ['3803eae15ac3e75435644125b188c32ce5895001@localhost:33001'],
    keyPath: require.resolve('./fullnode/dev-privatekey.json')
  },
  lightClient: {
    rpcSeeds: ['ws://localhost:33000']
  }
}
