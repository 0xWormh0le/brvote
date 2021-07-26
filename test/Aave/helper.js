const { ethers } = require("hardhat")

const latestBlock = async () =>
  parseInt((await ethers.provider.send('eth_getBlockByNumber', ['latest', false])).number)

const advanceBlock = async () =>
  await ethers.provider.send('evm_mine', [])

module.exports.advanceBlock = advanceBlock

module.exports.latestBlock = latestBlock

module.exports.advanceBlockTo = async target => {
  const currentBlock = await latestBlock()
  const start = Date.now()
  let notified
  if (target < currentBlock) {
    throw Error(`Target block #(${target}) is lower than current block #(${currentBlock})`)
  }

  while ((await latestBlock()) < target) {
    if (!notified && (Date.now() - start) >= 5000) {
      notified = true
      console.log(`advanceBlockTo: Advancing too many blocks is causing this test to be slow.'`)
    }
    await advanceBlock()
  }
}
