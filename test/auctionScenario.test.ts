import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, expect, constants } from "./constants.test";
import {
  currentTime,
  fastForward,
  setBiddersUp,
} from "./helpers.test";

let NFTContract: Contract;
let NFTInstance: any;

let AuctionContract: Contract;
let AuctionInstance: any;

let RegistryContract: Contract;
let RegistryInstance: any;

let SaleContract: Contract;
let SaleInstance: any;

let TokenContract: Contract;
let TokenInstance: any;

let owner: SignerWithAddress;
let artist: SignerWithAddress;
let bidder1: SignerWithAddress;
let bidder2: SignerWithAddress;
let bidder3: SignerWithAddress;

const Status = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  ENDED: "ENDED",
  ENDED_AND_CLAIMED: "ENDED & CLAIMED",
  CANCELLED: "CANCELLED",
};

describe("Auction scenario tests", function () {
  beforeEach(async () => {
    [owner, artist, bidder1, bidder2, bidder3] = await ethers.getSigners();

    // Deploy NFT
    NFTContract = await ethers.getContractFactory("NFTcontract");
    NFTInstance = await NFTContract.connect(owner).deploy("");

    // Deploy Registry
    RegistryContract = await ethers.getContractFactory("Registry");
    RegistryInstance = await RegistryContract.connect(owner).deploy();

    // Deploy Auction
    AuctionContract = await ethers.getContractFactory("NFTAuction");
    AuctionInstance = await AuctionContract.connect(owner).deploy(
      RegistryInstance.address
    );

    // Deploy Sale
    SaleContract = await ethers.getContractFactory("NFTSale");
    SaleInstance = await SaleContract.connect(owner).deploy(
      RegistryInstance.address
    );

    // Deploy Mock Token

    TokenContract = await ethers.getContractFactory("MockERC20");
    TokenInstance = await TokenContract.connect(owner).deploy();

    // registering contracts
    await RegistryInstance.connect(owner).setContractStatus(
      NFTInstance.address,
      true
    );
    await RegistryInstance.connect(owner).setContractStatus(
      AuctionInstance.address,
      true
    );
    await RegistryInstance.connect(owner).setCurrencyStatus(
      TokenInstance.address,
      true
    );

    await RegistryInstance.connect(owner).setSystemWallet(owner.address);
  });

  it("ideal scenario,mint NFT,auction goes through, highest bidder wins NFT,artist claims royalties,balances reflect correctly", async () => {
    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;

    /*
      1. artist mints NFT
      2. artist creates auction
      3. auction runs until end time, bidders bid on it
      4. highest bidder wins NFT
      5. NFT gets transferred to bidders account
      6. price of the NFT gets transferred to platform and artist wallet
    */

    // mint single NFT
    // uncomment if whitelisted is implemented on minting
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    await NFTInstance.connect(artist).mint(
      artist.address,
      "1",
      constants.nft.uri
    );

    let artistBal = await NFTInstance.balanceOf(artist.address, 1);

    expect(await artistBal).to.equal(1);

    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

    const b1BalanceBefore = await TokenInstance.balanceOf(bidder1.address);
    const b2BalanceBefore = await TokenInstance.balanceOf(bidder2.address);
    const b3BalanceBefore = await TokenInstance.balanceOf(bidder3.address);

    // creating auction
    await NFTInstance.connect(artist).setApprovalForAll(
      AuctionInstance.address,
      true
    );

    await AuctionInstance.connect(artist).createAuction(
      NFTInstance.address,
      1,
      startTime,
      endTime,
      constants.auction.price,
      TokenInstance.address
    );

    expect(await AuctionInstance.getAuctionStatus(constants.one)).to.equal(
      Status.ACTIVE
    );

    let auctionDetails = await AuctionInstance.getAuctionDetails(1);

    // check Auction contract balance if it holds NFT
    let auctionBal = await NFTInstance.balanceOf(AuctionInstance.address, 1);
    expect(auctionBal).to.equal(1);

    // setting up bidders with MockToken
    await AuctionInstance.connect(bidder1).bid(
      1,
      0,
      ethers.utils.parseUnits("200")
    );
    await AuctionInstance.connect(bidder2).bid(
      1,
      0,
      ethers.utils.parseUnits("250")
    );
    //checking BidPlaced event too
    await expect(
      AuctionInstance.connect(bidder3).bid(1, 0, ethers.utils.parseUnits("300"))
    )
      .to.emit(AuctionInstance, "BidPlaced")
      .withArgs(1, ethers.utils.parseUnits("300"));

    const b1BalanceAfter = await TokenInstance.balanceOf(bidder1.address);
    const b2BalanceAfter = await TokenInstance.balanceOf(bidder2.address);
    const b3BalanceAfter = await TokenInstance.balanceOf(bidder3.address);

    // end bid, winner claims nft
    await fastForward(constants.TEST.oneMonth);
    expect(await AuctionInstance.getAuctionStatus(constants.one)).to.equal(
      Status.ENDED
    );

    // try to steal NFT from non-winner account
    await expect(
      AuctionInstance.connect(bidder2).claimNft(1, bidder1.address)
    ).to.be.revertedWith("cannot claim nft");

    // winner claims NFT
    expect(await AuctionInstance.getHighestBidder(1)).to.equal(bidder3.address);
    await AuctionInstance.connect(bidder3).claimNft(1, bidder3.address);

    expect(await NFTInstance.balanceOf(AuctionInstance.address, 1)).to.equal(0);
    expect(await NFTInstance.balanceOf(bidder3.address, 1)).to.equal(1);

    // rest of the bidders claim refunds
    await AuctionInstance.connect(owner).claimFunds(TokenInstance.address);
    await AuctionInstance.connect(bidder1).claimFunds(TokenInstance.address);
    await AuctionInstance.connect(bidder2).claimFunds(TokenInstance.address);
    await AuctionInstance.connect(artist).claimFunds(TokenInstance.address);

    expect(await TokenInstance.balanceOf(owner.address)).to.equal(
      ethers.utils.parseUnits("9")
    ); // 3% of 300 (highest bid)
    expect(await TokenInstance.balanceOf(bidder1.address)).to.equal(
      b1BalanceBefore
    );
    expect(await TokenInstance.balanceOf(bidder2.address)).to.equal(
      b2BalanceBefore
    );
    expect(await TokenInstance.balanceOf(artist.address)).to.equal(
      ethers.utils.parseUnits("291")
    ); // 3% fee removed
  });
  // Single Auction scenarios
  it("Auction starts, bidder1 outbids last bidder,bidder1 wins,balances reflect", async () => {
  
    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;

    // mint single NFT
    // uncomment if whitelisted is implemented on minting
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    await NFTInstance.connect(artist).mint(
      artist.address,
      constants.one,
      constants.nft.uri
    );

    let artistBal = await NFTInstance.balanceOf(artist.address, 1);

    expect(artistBal).to.equal(1);

    // creating auction
    await NFTInstance.connect(artist).setApprovalForAll(
      AuctionInstance.address,
      true
    );

    await AuctionInstance.connect(artist).createAuction(
      NFTInstance.address,
      1,
      startTime,
      endTime,
      constants.auction.price,
      TokenInstance.address
    );

    // check Auction contract balance if it holds NFT
    let auctionBal = await NFTInstance.balanceOf(AuctionInstance.address, 1);
    expect(auctionBal).to.equal(1);

    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

    await AuctionInstance.connect(bidder1).bid(
      1,
      0,
      ethers.utils.parseUnits("200")
    );


    await AuctionInstance.connect(bidder2).bid(
      1,
      0,
      ethers.utils.parseUnits("250")
    );

   
    await AuctionInstance.connect(bidder3).bid(
      1,
      0,
      ethers.utils.parseUnits("300")
    );

 
    // bidder1 outbids bidder3

    await AuctionInstance.connect(bidder1).bid(
      1,
      ethers.utils.parseUnits("200"),
      ethers.utils.parseUnits("150")
    );

    expect(await AuctionInstance.getHighestBidder(1)).to.equal(bidder1.address);

    //end auction
    await fastForward(constants.TEST.oneMonth);

    // winner claims NFT
    await AuctionInstance.connect(bidder1).claimNft(1, bidder1.address);

    expect(await NFTInstance.balanceOf(AuctionInstance.address, 1)).to.equal(0);
    expect(await NFTInstance.balanceOf(bidder1.address, 1)).to.equal(1);

    // claiming funds
  });
  it("Auction gets cancelled,single NFT goes back to artist,bidders get refund,balances reflect", async () => {
    /*
1.mint NFT
2.create auction
3.give money to bidders
4. make bidders bid
5. check the balance of Auction contract
6. cancel auction
7. give NFT back to owner
8. give refunds to bidders
9. check if everyone's account is reflecting the correct amount */

    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;
    // use next line if whitelisted is implemented on minting
    // Using the owner account to set the whitelist to the
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    // use next line if whitelisting is implemented
    expect(await NFTInstance.getWhitelisted(artist.address)).to.equal(true);

    // Giving approval to the artist to access the NFT contract
    await NFTInstance.connect(artist).setApprovalForAll(
      AuctionInstance.address,
      true
    );

    // Minted an NFT
    await NFTInstance.connect(artist).mint(
      artist.address,
      "1",
      constants.nft.uri
    );

    await AuctionInstance.connect(artist).createAuction(
      NFTInstance.address,
      1,
      startTime,
      endTime,
      constants.auction.price,
      TokenInstance.address
    );

    // set bidders up and start bidding
    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

    let bidderBalBefore = await TokenInstance.balanceOf(bidder1.address);

    await AuctionInstance.connect(bidder1).bid(
      1,
      0,
      ethers.utils.parseUnits("200")
    );
    let bidderBalAfter = await TokenInstance.balanceOf(bidder1.address);

    expect(await bidderBalAfter).to.equal(
      bidderBalBefore.sub(ethers.utils.parseUnits("200"))
    );

    await AuctionInstance.connect(bidder2).bid(
      1,
      0,
      ethers.utils.parseUnits("250")
    );

    expect(await TokenInstance.balanceOf(AuctionInstance.address)).to.equal(
      ethers.utils.parseUnits("450")
    );

    // Cancelling the Auction from the bidders account
    await expect(
      AuctionInstance.connect(bidder1).cancelAuction(1)
    ).to.be.revertedWith("only owner or sale creator");

    // Cancelling the Auction from the artists account

    await AuctionInstance.connect(artist).cancelAuction(1);

    // check if highest bidder can not claim NFT after cancelling auction
    await expect(
      AuctionInstance.connect(bidder2).claimNft(1, bidder2.address)
    ).to.be.revertedWith("cannot claim from auction");

    // claim NFT back to artist

    await AuctionInstance.connect(artist).claimNft(1, artist.address);

    expect(await NFTInstance.balanceOf(artist.address, 1)).to.equal(1);

    await AuctionInstance.connect(bidder1).claimFunds(TokenInstance.address);
    await AuctionInstance.connect(bidder2).claimFunds(TokenInstance.address);

    let bidderBalCurrent = await TokenInstance.balanceOf(bidder1.address);
    expect(await bidderBalCurrent).to.equal(bidderBalBefore);
  });

  it("Auction ends with 0 bids, single NFT goes back to artist, balances reflect", async () => {
    /*
    1. Mint NFT
    2. Create Auction
    3. Fast forward time till the end of the auction
    4. Check the balance, if 0 then we send the NFT back to the artist
    5. Send the NFT back to the artist
    6. Check the balance of the NFT's in the Artists wallet
    */

    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;
    // use next line if whitelisted is implemented on minting
    // Using the owner account to set the whitelist to the
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    // use next line if whitelisting is implemented
    expect(await NFTInstance.getWhitelisted(artist.address)).to.equal(true);

    await NFTInstance.connect(artist).setApprovalForAll(
      AuctionInstance.address,
      true
    );

    // Mint and NFT to the artist
    await NFTInstance.connect(artist).mint(
      artist.address,
      "1",
      constants.nft.uri
    );

    await AuctionInstance.connect(artist).createAuction(
      NFTInstance.address,
      1,
      startTime,
      endTime,
      constants.auction.price,
      TokenInstance.address
    );

    await fastForward(constants.TEST.oneMonth);
    const auctionStatus = await AuctionInstance.connect(
      artist
    ).getAuctionStatus(1);

    expect(await TokenInstance.balanceOf(AuctionInstance.address)).to.equal(
      ethers.utils.parseUnits("0")
    );

    await AuctionInstance.connect(artist).claimNft(1, artist.address);
    expect(await NFTInstance.balanceOf(artist.address, 1)).to.equal(1);
  });

  it("Auction is pending,NFT is owned by auction contract,bidders cannot bid until auction status changes to active", async () => {
    /*
      1. Mint NFT
      2. Create the auction
      3. Change the status to pending by adding a future start time. Add starttime + 10000000
      4. Create bidders
      5. Try to bid on the auction
      6. Fast forward to that time
      7. Place a bid
    */

    let timeNow = await currentTime();
    let startTime = timeNow + constants.TEST.oneMonth;
    let endTime = startTime + constants.TEST.oneMonth;

    // use next line if whitelisted is implemented on minting
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    // use next line if whitelisting is implemented
    expect(await NFTInstance.getWhitelisted(artist.address)).to.equal(true);

    // Giving approval to the artist to access the NFT contract
    await NFTInstance.connect(artist).setApprovalForAll(
      AuctionInstance.address,
      true
    );

    // Minted an NFT
    await NFTInstance.connect(artist).mint(
      artist.address,
      "1",
      constants.nft.uri
    );

    await AuctionInstance.connect(artist).createAuction(
      NFTInstance.address,
      1,
      startTime,
      endTime,
      constants.auction.price,
      TokenInstance.address
    );

    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

    await expect(
      AuctionInstance.connect(bidder1).bid(1, 0, ethers.utils.parseUnits("200"))
    ).to.be.revertedWith("auction is not active");

    await fastForward(constants.TEST.oneMonth);

    await AuctionInstance.connect(bidder1).bid(
      1,
      0,
      ethers.utils.parseUnits("200")
    );
  });
});
