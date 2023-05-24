import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {  ethers, expect, constants } from "./constants.test";
import {
  currentTime,
  fastForward,
  setBiddersUp,
} from "./helpers.test";

let NFTContract: Contract;
let NFTInstance: any;

let SaleContract: Contract;
let SaleInstance: any;

let RegistryContract: Contract;
let RegistryInstance: any;

let TokenContract: Contract;
let TokenInstance: any;

let owner: SignerWithAddress;
let artist: SignerWithAddress;
let bob: SignerWithAddress;
let carol: SignerWithAddress;
let dave: SignerWithAddress;

const Status = {
  "PENDING": "PENDING",
  "ACTIVE": "ACTIVE",
  "ENDED": "ENDED",
  "CANCELLED": "CANCELLED"
}

describe("Sale scenario tests", function () {
  beforeEach(async () => {
    [owner, artist, bob, carol, dave] = await ethers.getSigners();

    // Deploy NFT
    NFTContract = await ethers.getContractFactory("NFTcontract");
    NFTInstance = await NFTContract.connect(owner).deploy("");

    // Deploy Registry
    RegistryContract = await ethers.getContractFactory("Registry");
    RegistryInstance = await RegistryContract.connect(owner).deploy();

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
    expect(await RegistryInstance.isPlatformContract(NFTInstance.address)).to.be.true;
    await RegistryInstance.connect(owner).setContractStatus(
      SaleInstance.address,
      true
    );
    expect(await RegistryInstance.isPlatformContract(SaleInstance.address)).to.be.true;
    await RegistryInstance.connect(owner).setCurrencyStatus(
      TokenInstance.address,
      true
    );
    expect(await RegistryInstance.isApprovedCurrency(TokenInstance.address)).to.be.true;
    
    await RegistryInstance.connect(owner).setSystemWallet(owner.address);
    const feeInfo = await RegistryInstance.feeInfo(ethers.utils.parseEther("100"));
    expect(feeInfo[0]).to.equal(owner.address);
  });

  it("ideal scenario,mint NFT,create sale in one day,buyers buy NFT,artist claims revenue,balances reflect correctly", async () => {
    const _currentTime = await currentTime();
    const startTime = _currentTime + constants.TEST.oneDay;
    let endTime = startTime + constants.TEST.oneMonth;

    /*
        1. artist mints NFT
        2. artist creates sale
        3. sale runs until end time
        4. purchasers buy NFT
        5. NFT gets transferred to buyer's account automatically
        6. price of the NFT gets transferred to platform where it updates balances
      */

    // mint NFTs
    // use next line if whitelisting is implemented
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    await NFTInstance.connect(artist).mint(
      artist.address,
      constants.hundred,
      constants.nft.uri
    );

    let artistBal = await NFTInstance.balanceOf(artist.address, 1);

    expect(artistBal).to.equal(constants.hundred);

    // creating sale
    await NFTInstance.connect(artist).setApprovalForAll(
      SaleInstance.address,
      true
    );
    await SaleInstance.connect(artist).createSale(
      NFTInstance.address,
      1,
      constants.hundred,
      startTime,
      endTime,
      constants.sale.price,
      constants.sale.maxBuyAmount,
      TokenInstance.address
    );

    // check Sale contract balance if it holds NFT
    let saleBal = await NFTInstance.balanceOf(SaleInstance.address, 1);

    expect(await saleBal).to.equal(constants.hundred);

    await setBiddersUp(
      TokenInstance,
      SaleInstance,
      bob,
      carol,
      dave
    );

    const ownerBalanceBefore = await TokenInstance.balanceOf(owner.address);
    const artistBalanceBefore = await TokenInstance.balanceOf(artist.address);
    const bobBalanceBefore = await TokenInstance.balanceOf(bob.address);
    const carolBalanceBefore = await TokenInstance.balanceOf(carol.address);
    const daveBalanceBefore = await TokenInstance.balanceOf(dave.address);
    
    await expect(SaleInstance.connect(bob).buy(1, bob.address, constants.sale.maxBuyAmount, 0))
      .to.be.revertedWith("sale is not active");

    expect(await SaleInstance.getSaleStatus(constants.one))
      .to.equal(Status.PENDING);

    await fastForward(constants.TEST.oneDay);

    expect(await SaleInstance.getSaleStatus(constants.one))
      .to.equal(Status.ACTIVE);

    // buys max
    await SaleInstance.connect(bob).buy(1, bob.address, constants.sale.maxBuyAmount, 0);
    // buys more than max, expect revert
    await expect(SaleInstance.connect(carol).buy(
      1, 
      carol.address, 
      constants.sale.maxBuyAmount.add("1"),
      0
    )).to.be.revertedWith("buy quantity too high");
    // sends to another, checks event
    expect(await SaleInstance.connect(dave).buy(1, bob.address, constants.one, 0))
      .to.emit(SaleInstance, "Purchase")
      .withArgs(constants.one, dave.address, bob.address, constants.one);


    const bobBalanceAfter = await TokenInstance.balanceOf(bob.address);
    const carolBalanceAfter = await TokenInstance.balanceOf(carol.address);
    const daveBalanceAfter = await TokenInstance.balanceOf(dave.address);
    // fee calculations
    // number of NFTs sold * price * rate
    const totalRevenue = ethers.utils.parseUnits("1100"); // 100 price * 11 nfts
    const fee = totalRevenue.mul("300").div("10000");

    expect(bobBalanceBefore.sub(bobBalanceAfter))
      .to.equal(constants.sale.price.mul("10"));
    expect(carolBalanceAfter).to.equal(carolBalanceBefore);
    expect(daveBalanceBefore.sub(daveBalanceAfter))
      .to.equal(constants.sale.price);
    expect(await SaleInstance.getClaimableBalance(artist.address, TokenInstance.address))
      .to.equal(totalRevenue.sub(fee));

    const bobNftBalance = await NFTInstance.balanceOf(bob.address, constants.one);
    const carolNftBalance = await NFTInstance.balanceOf(carol.address, constants.one);
    const daveNftBalance = await NFTInstance.balanceOf(dave.address, constants.one);

    expect(bobNftBalance).to.equal(ethers.BigNumber.from("11"));
    expect(carolNftBalance).to.equal(ethers.constants.Zero);
    expect(daveNftBalance).to.equal(ethers.constants.Zero);

    await expect(SaleInstance.connect(artist).claimNfts(constants.one))
      .to.be.revertedWith("cannot claim before sale closes");

    expect(await SaleInstance.getSaleStatus(constants.one))
      .to.equal(Status.ACTIVE);

    // end sale
    await fastForward(constants.TEST.oneMonth);

    expect(await SaleInstance.getSaleStatus(constants.one))
      .to.equal(Status.ENDED);

    await expect(SaleInstance.connect(bob).buy(1, bob.address, constants.one, 0))
      .to.be.revertedWith("sale is not active");

    expect(await NFTInstance.balanceOf(artist.address, constants.one))
      .to.equal(ethers.constants.Zero);
    await SaleInstance.connect(artist).claimNfts(constants.one);
    expect(await NFTInstance.balanceOf(artist.address, constants.one))
      .to.equal(ethers.BigNumber.from("89"));

    await SaleInstance.connect(owner).claimFunds(TokenInstance.address);
    const ownerBalanceAfter = await TokenInstance.balanceOf(owner.address);
    expect(ownerBalanceAfter).to.equal(ownerBalanceBefore.add(fee));

    // no royalties to artist here since artist is seller,
    // will need to add system fees when they're more clear
    await SaleInstance.connect(artist).claimFunds(TokenInstance.address);
    const artistBalanceAfter = await TokenInstance.balanceOf(artist.address);
    expect(artistBalanceAfter)
      .to.equal(artistBalanceBefore.add(totalRevenue.sub(fee)));
  });
  
  it("Sale is created, some are sold, seller cancels,NFTs go back to seller,previous sales still valid",async () => {
    const _currentTime = await currentTime();
    const startTime = _currentTime 
    let endTime = startTime + constants.TEST.oneMonth;

    // mint 100 NFTs
    // use next line if whitelisting is implemented
    await NFTInstance.connect(owner).setWhitelisted(artist.address, true);
    await NFTInstance.connect(artist).mint(
      artist.address,
      constants.hundred,
      constants.nft.uri
    );

  // creating sale
  await NFTInstance.connect(artist).setApprovalForAll(
    SaleInstance.address,
    true
  );
  await SaleInstance.connect(artist).createSale(
    NFTInstance.address,
    1,
    constants.hundred,
    startTime,
    endTime,
    constants.sale.price,
    constants.sale.maxBuyAmount,
    TokenInstance.address
  );

// give bidders money
  await setBiddersUp(
    TokenInstance,
    SaleInstance,
    bob,
    carol,
    dave
  );
// bob buys half of the amount
  await SaleInstance.connect(bob).buy(1, bob.address,ethers.BigNumber.from("5"), 0);
  expect(await NFTInstance.balanceOf(bob.address,1)).to.equal(ethers.BigNumber.from("5"))

// artist cancels sale
await SaleInstance.connect(artist).cancelSale(1);

expect (await SaleInstance.getSaleStatus(1)).to.equal(Status.CANCELLED);

// artist claims back remaining NFTs
await SaleInstance.connect(artist).claimNfts(1);
expect(await NFTInstance.balanceOf(artist.address,1)).to.equal(ethers.BigNumber.from("95"));

// artist claims revenue after sold NFTs
let artistBalanceBefore = await TokenInstance.balanceOf(artist.address);
let royalties = await SaleInstance.getClaimableBalance(artist.address,TokenInstance.address)

await SaleInstance.connect(artist).claimFunds(TokenInstance.address);

expect(await TokenInstance.balanceOf(artist.address)).to.equal(artistBalanceBefore.add(royalties));
  });
});
