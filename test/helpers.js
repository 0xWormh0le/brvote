const { ethers } = require("hardhat")

module.exports.generateRandomBytes32 = () => {
  return '0x' +
    new Array(32).fill(0)
      .map(() => ('00' + Math.floor(Math.random() * 256).toString(16)).slice(-2))
      .join('')
}

module.exports.time = {
  increase: async duration => {
    await ethers.provider.send("evm_increaseTime", [duration]);
    await ethers.provider.send("evm_mine");
  }
}

module.exports.bytes32 = value =>
  '0x' + value.toString(16).padStart(32 * 2, '0')