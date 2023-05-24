import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, expect, constants } from "./constants.test";
import {
  currentTime,
  fastForward,
  setBiddersUp,
  setupAuction,
} from "./helpers.test";

let NFTContract: Contract;
let NFTInstance: any;

let AuctionContract: Contract;
let AuctionInstance: any;

let TokenContract: Contract;
let TokenInstance: any;

let RegistryContract: Contract;
let RegistryInstance: any;

let TestUserContract: Contract;
let TestUserInstance: any;

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

describe("Auction unit tests", function () {
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

    // Deploy Mock Token
    TokenContract = await ethers.getContractFactory("MockERC20");
    TokenInstance = await TokenContract.connect(owner).deploy();

    // Deploy Mock Token
    TestUserContract = await ethers.getContractFactory("TestUser");
    TestUserInstance = await TestUserContract.connect(owner).deploy();

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

  it("winner of NFT cannot claim the funds back", async () => {
    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;

    // uncomment if whitelisted is implemented on minting
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    await NFTInstance.connect(artist).mint(
      artist.address,
      "1",
      constants.nft.uri
    );

    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );
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

    await AuctionInstance.connect(bidder1).bid(
      1,
      0,
      ethers.utils.parseUnits("210")
    );
    await AuctionInstance.connect(bidder2).bid(
      1,
      0,
      ethers.utils.parseUnits("250")
    );

    await fastForward(constants.TEST.oneMonth);

    await AuctionInstance.connect(bidder2).claimNft(1, bidder2.address);
    await expect(
      AuctionInstance.connect(bidder2).claimFunds(TokenInstance.address)
    ).to.be.revertedWith("nothing to claim");
  });

  // setter and getter functions
  it("getAuctionDetails works properly", async () => {
    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;

    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );

    let auctionDetails = await AuctionInstance.getAuctionDetails(1);

    expect(await auctionDetails[0]).to.equal(1);
    expect(await auctionDetails[1]).to.equal(artist.address);
    expect(await auctionDetails[2]).to.equal(NFTInstance.address);
    expect(await auctionDetails[3]).to.equal(1);
    expect(await auctionDetails[4]).to.equal(startTime);
    expect(await auctionDetails[5]).to.equal(endTime);
    expect(await auctionDetails[6]).to.equal(constants.auction.price);
    expect(await auctionDetails[7]).to.equal(TokenInstance.address);
  });

  it("getAuctionStatus works properly", async () => {
    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;

    // uncomment if whitelisted is implemented on minting
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    await NFTInstance.connect(artist).mint(
      artist.address,
      "1",
      constants.nft.uri
    );
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

    expect(await AuctionInstance.getAuctionStatus(1)).to.equal(Status.ACTIVE);
  });
  it("getClaimableBalance works properly", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );

    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );
    await AuctionInstance.connect(bidder1).bid(
      1, // auctionID
      0, // claimable balance
      ethers.utils.parseUnits("210") // external funds
    );

    await AuctionInstance.connect(bidder2).bid(
      1, // auctionID
      0, // claimable balance
      ethers.utils.parseUnits("250") // external funds
    );

    expect(
      await AuctionInstance.getClaimableBalance(
        bidder1.address,
        TokenInstance.address
      )
    ).to.equal(ethers.utils.parseUnits("210"));
  });
  // Bid function
  it("bidder can't bid if auction is not yet active", async () => {
    let startTime = (await currentTime()) + constants.TEST.oneDay;
    let endTime = startTime + constants.TEST.oneMonth;

    // uncomment if whitelisted is implemented on minting
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    await NFTInstance.connect(artist).mint(
      artist.address,
      "1",
      constants.nft.uri
    );
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

    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );
    await expect(
      AuctionInstance.connect(bidder1).bid(1, 0, ethers.utils.parseUnits("210"))
    ).to.be.revertedWith("auction is not active");
  });
  it("bidder can't bid if auction has ended", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

    await fastForward(constants.TEST.oneMonth);

    await expect(
      AuctionInstance.connect(bidder1).bid(1, 0, ethers.utils.parseUnits("210"))
    ).revertedWith("auction is not active");
  });
  it("bidder can't bid if auction is cancelled", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

    await AuctionInstance.cancelAuction(1);

    await expect(
      AuctionInstance.connect(bidder1).bid(1, 0, ethers.utils.parseUnits("210"))
    ).revertedWith("auction is not active");
  });

  it("a bid has to be higher than previous bid", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
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

    await expect(
      AuctionInstance.connect(bidder2).bid(1, 0, ethers.utils.parseUnits("150"))
    ).revertedWith("bid not high enough");
  });
  it("a bid as to be higher than 0", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

    await expect(
      AuctionInstance.connect(bidder1).bid(1, 0, ethers.utils.parseUnits("0"))
    ).revertedWith("bid not high enough");
  });

  it("BidPlaced event emits correctly", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

    expect(
      await AuctionInstance.connect(bidder1).bid(
        1,
        0,
        ethers.utils.parseUnits("210")
      )
    )
      .to.emit(AuctionInstance, "BidPlaced")
      .withArgs(1, ethers.utils.parseUnits("210"));
  });

  // claimNft function tests
  it("only highest bidder can claim NFT after auction ended", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
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
      ethers.utils.parseUnits("210")
    );

    await AuctionInstance.connect(bidder2).bid(
      1,
      0,
      ethers.utils.parseUnits("250")
    );

    await fastForward(constants.TEST.oneMonth);

    await expect(
      AuctionInstance.connect(bidder1).claimNft(1, bidder1.address)
    ).to.be.revertedWith("cannot claim nft");

    await AuctionInstance.connect(bidder2).claimNft(1, bidder2.address);

    expect(await NFTInstance.balanceOf(AuctionInstance.address, 1)).to.equal(0);
    expect(await NFTInstance.balanceOf(bidder2.address, 1)).to.equal(1);
  });
  it("can't claim NFT before auction ended", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
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
      ethers.utils.parseUnits("210")
    );

    await expect(
      AuctionInstance.connect(bidder1).claimNft(1, bidder1.address)
    ).to.be.revertedWith("nft not available for claiming");
  });

  it("can't claim NFT if auction is pending", async () => {
    let startTime = (await currentTime()) + constants.TEST.oneDay;
    let endTime = startTime + constants.TEST.oneMonth;

    // uncomment if whitelisted is implemented on minting
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    await NFTInstance.connect(artist).mint(
      artist.address,
      "1",
      constants.nft.uri
    );
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

    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );
    await expect(
      AuctionInstance.connect(bidder1).bid(1, 0, ethers.utils.parseUnits("210"))
    ).to.be.revertedWith("auction is not active");

    await expect(
      AuctionInstance.connect(bidder1).claimNft(1, bidder1.address)
    ).to.be.revertedWith("cannot claim nft");
  });

  it("can't bid lower than reserve price", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

    await expect(
      AuctionInstance.connect(bidder1).bid(1, 0, ethers.utils.parseUnits("1"))
    ).to.be.revertedWith("bid is lower than reserve price");
  });
  it("seller cannot reclaim NFT after successful auction", async () => {
    // TODO - check why it's not reverting
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
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
      ethers.utils.parseUnits("210")
    );

    await AuctionInstance.connect(bidder1).bid(
      1,
      0,
      ethers.utils.parseUnits("250")
    );

    await fastForward(constants.TEST.oneMonth);

    await expect(
      AuctionInstance.connect(artist).claimNft(1, artist.address)
    ).to.be.revertedWith("owner cannot reclaim nft");
  });

  it("claimNFT event emits correctly", async () => {
    // TODO - check numbers
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
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
      ethers.utils.parseUnits("210")
    );

    await AuctionInstance.connect(bidder2).bid(
      1,
      0,
      ethers.utils.parseUnits("250")
    );

    await fastForward(constants.TEST.oneMonth);

    await expect(AuctionInstance.connect(bidder2).claimNft(1, bidder2.address))
      .to.emit(AuctionInstance, "ClaimNFT")
      .withArgs(
        1,
        bidder2.address,
        bidder2.address,
        ethers.utils.parseUnits("250")
      );
  });

  // claiming funds
  it("no bids, nothing to claim from token contract", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

    await fastForward(constants.TEST.oneMonth);

    await expect(
      AuctionInstance.connect(artist).claimFunds(TokenInstance.address)
    ).to.be.revertedWith("nothing to claim");
  });
  it("artist can claim funds after successful sale", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );
    const bid = ethers.utils.parseUnits("210");
    await AuctionInstance.connect(bidder1).bid(1, 0, bid);

    await fastForward(constants.TEST.oneMonth);

    await AuctionInstance.connect(bidder1).claimNft(1, bidder2.address);
    expect(await NFTInstance.balanceOf(bidder2.address, 1)).to.equal(1);

    await AuctionInstance.connect(artist).claimFunds(TokenInstance.address);

    let artistBal = await TokenInstance.balanceOf(artist.address);
    const systemInfo = await RegistryInstance.feeInfo(bid);

    expect(artistBal).to.equal(bid.sub(systemInfo[1]));
  });
  it("bidders can reclaim funds back after cancelled auction", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
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
      ethers.utils.parseUnits("210")
    );

    await AuctionInstance.connect(artist).cancelAuction(1);

    await AuctionInstance.connect(bidder1).claimFunds(TokenInstance.address);

    expect(await TokenInstance.balanceOf(bidder1.address)).to.equal(
      bidderBalBefore
    );
  });
  it("BalanceUpdated event emits properly", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
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
      ethers.utils.parseUnits("210")
    );

    await AuctionInstance.connect(artist).cancelAuction(1);

    expect(
      await AuctionInstance.connect(bidder1).claimFunds(TokenInstance.address)
    )
      .to.emit(AuctionInstance, "BalanceUpdated")
      .withArgs(
        bidder1.address,
        TokenInstance.address,
        await AuctionInstance.getClaimableBalance(
          bidder1.address,
          TokenInstance.address
        )
      );
  });

  // cancelling auction
  it("auction status changes correctly after cancellation", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );

    await AuctionInstance.cancelAuction(1);

    expect(await AuctionInstance.getAuctionStatus(1)).to.equal("CANCELLED");
  });
  it("only owner or creator can cancel auction", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
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
      ethers.utils.parseUnits("210")
    );

    await expect(
      AuctionInstance.connect(bidder1).cancelAuction(1)
    ).to.be.revertedWith("only owner or sale creator");
  });

  it("check system fees", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );
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
      ethers.utils.parseUnits("100")
    );

    await fastForward(constants.TEST.oneMonth);
    await AuctionInstance.connect(bidder1).claimNft(1, bidder1.address);

    expect(
      await AuctionInstance.getClaimableBalance(
        owner.address,
        TokenInstance.address
      )
    ).to.equal(constants.TEST.fees);
  });

  it("returns bid details correctly", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );

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
      ethers.utils.parseUnits("100")
    );

    let bidDetails = await AuctionInstance.getBidDetails(1, bidder1.address);

    expect(await bidDetails[1]).to.equal(bidder1.address);
    expect(await bidDetails[2]).to.equal(ethers.utils.parseUnits("100"));
  });
  it("after NFT claim auction status changes correctly", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );

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
      ethers.utils.parseUnits("100")
    );

    await fastForward(constants.TEST.oneMonth);

    await AuctionInstance.connect(bidder1).claimNft(1, bidder1.address);

    expect(await AuctionInstance.getAuctionStatus(1)).to.equal(
      "ENDED & CLAIMED"
    );
  });
  it("msg.value has to be equal to bidders ETH balance", async () => {
    // "mismatch of value and args" in bid function
    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;

    // uncomment if whitelisted is implemented on minting
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    await NFTInstance.connect(artist).mint(
      artist.address,
      "1",
      constants.nft.uri
    );

    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      bidder3
    );

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
      constants.TEST.ETH
    );

    await expect(
      AuctionInstance.connect(bidder1).bid(
        1,
        0,
        ethers.utils.parseUnits("200"),
        { value: ethers.utils.parseUnits("100", "ether") }
      )
    ).to.be.revertedWith("mismatch of value and args");
  });
  it("ETH payment failed", async () => {
    await RegistryInstance.setContractStatus(TestUserInstance.address, true);
    // uncomment if whitelisted is implemented on minting
    await NFTInstance.connect(owner).setWhitelisted(
      TestUserInstance.address,
      true
    );

    await TestUserInstance.mintNFTandCreateAuction(
      NFTInstance.address,
      AuctionInstance.address,
      AuctionInstance.address
    );

    await AuctionInstance.connect(bidder1).bid(
      1,
      0,
      ethers.utils.parseUnits("1"),
      { value: ethers.utils.parseUnits("1", "ether") }
    );

    await fastForward(constants.TEST.oneMonth);

    await AuctionInstance.connect(bidder1).claimNft(1, bidder1.address);

    await expect(
      TestUserInstance.connect(artist).failClaimFromAuction(
        AuctionInstance.address
      )
    ).to.be.revertedWith("ETH payout failed");
  });

  it("users claimable balance decreases properly after claim", async () => {
    await setupAuction(
      NFTInstance,
      AuctionInstance,
      TokenInstance.address,
      owner,
      artist
    );

    await setBiddersUp(
      TokenInstance,
      AuctionInstance,
      bidder1,
      bidder2,
      artist
    );

    await AuctionInstance.connect(bidder1).bid(
      1,
      0,
      ethers.utils.parseUnits("200")
    );

    await fastForward(constants.TEST.oneMonth);

    await AuctionInstance.connect(bidder1).claimNft(1, bidder1.address);

    let artistClaimBef = await AuctionInstance.getClaimableBalance(
      artist.address,
      TokenInstance.address
    );

    await NFTInstance.connect(bidder1).setApprovalForAll(
      AuctionInstance.address,
      true
    );

    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.twoMonths;

    await AuctionInstance.connect(bidder1).createAuction(
      NFTInstance.address,
      1,
      startTime,
      endTime,
      constants.auction.price,
      TokenInstance.address
    );

    // artist buys NFT back

    await AuctionInstance.connect(artist).bid(
      2,
      ethers.utils.parseUnits("100"),
      ethers.utils.parseUnits("50")
    );

    await fastForward(constants.TEST.twoMonths);

    let amountFromBal = ethers.utils.parseUnits("100");
    let artistClaimAfter = await AuctionInstance.getClaimableBalance(
      artist.address,
      TokenInstance.address
    );

    expect(await artistClaimAfter).to.equal(artistClaimBef.sub(amountFromBal));
  });
});
