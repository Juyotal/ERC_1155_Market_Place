export const { expect } = require("chai");
export const { ethers } = require("hardhat");
export const hre = require("hardhat");

export const constants = {
  one: ethers.BigNumber.from("1"),
  hundred: ethers.BigNumber.from("100"),
  nft: {
    uri: "ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/1",
    uri2: "ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/2",
    redeemDetails: "can be redeemed for a mug"
  },
  sale: {
    price: ethers.utils.parseUnits("100"),
    maxBuyAmount: ethers.BigNumber.from("10")
    
  },
  auction: {
    price: ethers.utils.parseUnits("100")
  },
  TEST: {
    oneDai: ethers.utils.parseEther("1"),
    oneDay: 86400,
    oneMonth: 2629800,
    twoMonths: 2629800 * 2,
    ETH: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
    fees: ethers.utils.parseEther("3") //assumes bid/price of 100
  },
  POLYGON: {
  DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
  }
}

module.exports = {
  hre,
  ethers,
  expect,
  constants
}