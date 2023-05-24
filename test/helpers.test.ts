import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "@ethersproject/contracts";
import { ethers, expect, constants } from "./constants.test";


// Gets the time of the last block.
export const currentTime = async () => {
  const { timestamp } = await ethers.provider.getBlock("latest");
  return timestamp;
};

// Increases the time in the EVM.
// seconds = number of seconds to increase the time by
export const fastForward = async (seconds:any) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
};

export const deployNft = async (deployer: SignerWithAddress) => {
  const NftArtifacts = await ethers.getContractFactory("IndiNFT", deployer);
  return await NftArtifacts.deploy("");
}

// for use if whitelisting is implemented
export const whitelistArtist = async (Nft: Contract, owner: SignerWithAddress, artistAddress: string) => {
  expect(await Nft.getWhitelisted(artistAddress)).to.be.false;
  await Nft.connect(owner).setWhitelisted(artistAddress, true);
  expect(await Nft.getWhitelisted(artistAddress)).to.be.true;
}

// must be first mint from contract or will not work
export const mintSingleNft = async (Nft: Contract, artist: SignerWithAddress) => {
  const origArtistBalance = await Nft.balanceOf(artist.address, constants.one);
  await Nft.connect(artist).mint(artist.address, constants.one, constants.nft.uri);
  const postArtistBalance = await Nft.balanceOf(artist.address, constants.one);
  expect(postArtistBalance).to.equal(origArtistBalance.add(1));
  const nftCreator = (await Nft.getNftProperties(constants.one)).creator;
  expect(nftCreator).to.equal(artist.address);
}

export const mintBatch = async (Nft: Contract, owner: SignerWithAddress, artist: SignerWithAddress) => {
  // use next line if whitelisting is implemented
  await whitelistArtist(Nft, owner, artist.address);
  const origArtistBalanceId1 = await Nft.balanceOf(artist.address, constants.one);
  const origArtistBalanceId2 = await Nft.balanceOf(artist.address, ethers.BigNumber.from("2"));

  await Nft.connect(artist).mintBatch(
    artist.address,
    [constants.one, constants.one],
    [constants.nft.uri, constants.nft.uri2]
  );

  const postArtistBalanceId1 = await Nft.balanceOf(artist.address, constants.one);
  const postArtistBalanceId2 = await Nft.balanceOf(artist.address, ethers.BigNumber.from("2"));

  expect(postArtistBalanceId1).to.equal(origArtistBalanceId1.add(1));
  expect(postArtistBalanceId2).to.equal(origArtistBalanceId2.add(1));
}

export const setNftDetails = async (Nft: Contract, artist: SignerWithAddress) => {
  await mintSingleNft(Nft, artist);
  await Nft.connect(artist).setRedeem(constants.one, constants.nft.redeemDetails, true);
  const properties = await Nft.getNftProperties(constants.one);
  expect(properties.redeemDescrip).to.equal(constants.nft.redeemDetails);
  expect(properties.isRedeemable).to.be.true;
}

export const exemptFromRoyalties = async (Nft: Contract, artist: SignerWithAddress, buyerAddress: string) => {
  // await mintSingleNft(Nft, artist);
  expect(await Nft.isExemptFromRoyalties(constants.one, buyerAddress))
    .to.be.false;
  await Nft.connect(artist).setRoyaltyExemption(constants.one, buyerAddress, true);
  expect(await Nft.isExemptFromRoyalties(constants.one, buyerAddress))
    .to.be.true;
}

export const setBiddersUp = async (
  TokenInstance:Contract,
  SaleOrAuction: Contract,
  bidder1:SignerWithAddress,
  bidder2:SignerWithAddress,
  bidder3:SignerWithAddress
  ) => {
  await TokenInstance.mint(bidder1.address,ethers.utils.parseUnits("1000000000"));
  await TokenInstance.mint(bidder2.address,ethers.utils.parseUnits("1000000000"));
  await TokenInstance.mint(bidder3.address,ethers.utils.parseUnits("1000000000"));

  await TokenInstance.connect(bidder1).approve(SaleOrAuction.address, ethers.constants.MaxUint256);
  await TokenInstance.connect(bidder2).approve(SaleOrAuction.address, ethers.constants.MaxUint256);
  await TokenInstance.connect(bidder3).approve(SaleOrAuction.address, ethers.constants.MaxUint256);
}

export const setupAuction = async (
  Nft: Contract,
  Auction: Contract,
  tokenAddress: string,
  owner: SignerWithAddress,
  seller: SignerWithAddress
) => {
  let startTime = await currentTime();
  let endTime = startTime + constants.TEST.oneMonth;

  // mint single NFT
  // use next line if whitelisted is implemented on minting
  await Nft.connect(owner).setWhitelisted(seller.address, true);
  await Nft.connect(seller).mint(
    seller.address,
    constants.one,
    constants.nft.uri
  );

  let sellerBal = await Nft.balanceOf(seller.address, 1);
  expect(sellerBal).to.equal(1);

  // creating auction
  await Nft.connect(seller).setApprovalForAll(
    Auction.address,
    true
  );

  await Auction.connect(seller).createAuction(
    Nft.address,
    1,
    startTime,
    endTime,
    constants.auction.price,
    tokenAddress
  );
  // check Auction contract balance if it holds NFT
  let auctionBal = await Nft.balanceOf(Auction.address, 1);
  expect(auctionBal).to.equal(1);
}

export const setupSale = async (
  Nft: Contract,
  Sale: Contract,
  tokenAddress: string,
  owner: SignerWithAddress,
  seller: SignerWithAddress,
) => {
  let startTime = await currentTime();
  let endTime = startTime + constants.TEST.oneMonth;

  // mint single NFT
  // use next line if whitelisted is implemented on minting
  await Nft.connect(owner).setWhitelisted(seller.address, true);
  console.log(seller.address)
  await Nft.connect(seller).mint(
    seller.address,
    constants.hundred,
    constants.nft.uri
  );

  let sellerBal = await Nft.balanceOf(seller.address, 1);
  expect(sellerBal).to.equal(100);

  // creating sale
  await Nft.connect(seller).setApprovalForAll(
    Sale.address,
    true
  );

  await Sale.connect(seller).createSale(
    Nft.address,
    constants.one,
    constants.hundred,
    startTime,
    endTime,
    constants.sale.price,
    constants.sale.maxBuyAmount,
    tokenAddress
  );
  // check Sale contract balance if it holds NFT
  let saleBal = await Nft.balanceOf(Sale.address, 1);
  expect(saleBal).to.equal(100);
}
export const setupStatusSale = async (
  Nft: Contract,
  Sale: Contract,
  tokenAddress: string,
  owner: SignerWithAddress,
  seller: SignerWithAddress,
  startTime: number,
  endTime: number
) => {

  // mint single NFT
  // use next line if whitelisted is implemented on minting
  await Nft.connect(owner).setWhitelisted(seller.address, true);
 
  await Nft.connect(seller).mint(
    seller.address,
    constants.hundred,
    constants.nft.uri
  );

  let sellerBal = await Nft.balanceOf(seller.address, 1);
  expect(sellerBal).to.equal(100);

  // creating sale
  await Nft.connect(seller).setApprovalForAll(
    Sale.address,
    true
  );

  await Sale.connect(seller).createSale(
    Nft.address,
    constants.one,
    constants.hundred,
    startTime,
    endTime,
    constants.sale.price,
    constants.sale.maxBuyAmount,
    tokenAddress
  );
  // check Sale contract balance if it holds NFT
  let saleBal = await Nft.balanceOf(Sale.address, 1);
  expect(saleBal).to.equal(100);
}

module.exports = {
  deployNft,
  whitelistArtist,
  mintSingleNft,
  mintBatch,
  setNftDetails,
  exemptFromRoyalties,
  currentTime,
  fastForward,
  setBiddersUp,
  setupAuction,
  setupSale,
  setupStatusSale,
  
}