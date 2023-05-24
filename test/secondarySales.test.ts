import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, expect, constants } from "./constants.test";
import {
  mintBatch,
  currentTime,
  fastForward,
  setBiddersUp,
  setupAuction
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
let alice: SignerWithAddress;
let bob: SignerWithAddress;
let chad: SignerWithAddress;

const Status = {
  "PENDING": "PENDING",
  "ACTIVE": "ACTIVE",
  "ENDED": "ENDED",
  "ENDED_AND_CLAIMED": "ENDED & CLAIMED",
  "CANCELLED": "CANCELLED"
}

describe("Royalty tests", function () {
  beforeEach(async () => {
    [owner, artist, alice,bob,chad] = await ethers.getSigners();

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
    await RegistryInstance.connect(owner).setContractStatus(
      SaleInstance.address,
      true
    );
    await RegistryInstance.connect(owner).setCurrencyStatus(
      TokenInstance.address,
      true
    );
  });
  it("artist mints and sells Auction NFT,winner sells NFT to new person, royalty goes to artist", async () => {


      /* 
      1. artist mints NFT
      2.artist sales NFT
      3. alice wins NFT
      4. alices sells NFT to bob
      5. check if royalty goes back to artist*/
  
      await setBiddersUp(
        TokenInstance,
        AuctionInstance,
        alice,
        bob,
        chad
      );

      await NFTInstance.connect(alice).setApprovalForAll(
        AuctionInstance.address,
        true
      );

      await setupAuction(
        NFTInstance,
        AuctionInstance,
        TokenInstance.address,
        owner,
        artist
      );

      
      await AuctionInstance.connect(bob).bid(1, 0, ethers.utils.parseUnits("201"));
      await AuctionInstance.connect(alice).bid(1, 0, ethers.utils.parseUnits("250"));

      await fastForward(constants.TEST.oneMonth);

      await AuctionInstance.connect(alice).claimNft(1, alice.address);

      await AuctionInstance.connect(artist).claimFunds(TokenInstance.address);

      
    let artistBalAfterNFTSale = await TokenInstance.balanceOf(artist.address);

      expect(await NFTInstance.balanceOf(alice.address, 1)).to.equal(1);

      // Alice creates auction with NFT
      let startTime = await currentTime();
      let endTime = startTime + constants.TEST.oneMonth;

      await AuctionInstance.connect(alice).createAuction(
        NFTInstance.address,
        1,
        startTime,
        endTime,
        constants.auction.price,
        TokenInstance.address
      );

    
      await AuctionInstance.connect(chad).bid(2, 0, ethers.utils.parseUnits("201"));
      await AuctionInstance.connect(bob).bid(2, 0, ethers.utils.parseUnits("250"));

      await fastForward(constants.TEST.oneMonth);

      await AuctionInstance.connect(bob).claimNft(2, bob.address);

      expect(await NFTInstance.balanceOf(bob.address, 1)).to.equal(1);

      // check royalty fees
    let royaltyFee = await NFTInstance.royaltyInfo(2,ethers.utils.parseUnits("250"));

    let artistBalBefore = await TokenInstance.balanceOf(artist.address);
    
    await AuctionInstance.connect(artist).claimFunds(TokenInstance.address);


    let artistBalAfter = await TokenInstance.balanceOf(artist.address);
    expect(await artistBalAfter).to.equal(artistBalBefore.add(royaltyFee[1]));

  });
  it("artist mints and sells Sale NFTs,buyer sells NFTs to new person, royalty goes to artist", async () => {
    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;

    // minting batch 
    await mintBatch(NFTInstance,owner,artist);

    // set bidders up with money
    await setBiddersUp(
        TokenInstance,
        SaleInstance,
        alice,
        bob,
        chad
      );

      let sellerBal = await NFTInstance.balanceOf(artist.address,1);
      expect(sellerBal).to.equal(1);

      let sellerBalTokenID2 = await NFTInstance.balanceOf(artist.address,2);
      expect(sellerBalTokenID2).to.equal(1);
     
    
      // creating sale
      await NFTInstance.connect(artist).setApprovalForAll(
        SaleInstance.address,
        true
      );
    
      // create sale for tokenID1
      await SaleInstance.connect(artist).createSale(
        NFTInstance.address,
        constants.one,
        constants.one,
        startTime,
        endTime,
        constants.sale.price,
        constants.sale.maxBuyAmount,
        TokenInstance.address
      );

        // create sale for tokenID2
      await SaleInstance.connect(artist).createSale(
        NFTInstance.address,
        2,
        constants.one,
        startTime,
        endTime,
        constants.sale.price,
        constants.sale.maxBuyAmount,
        TokenInstance.address
      );

    
      // check Sale contract balance if it holds NFT
      let saleBal = await NFTInstance.balanceOf(SaleInstance.address, 1);
      expect(saleBal).to.equal(1);

  
      // alice buys both NFTs
       await SaleInstance.connect(alice).buy(1,alice.address,1,0);
       await SaleInstance.connect(alice).buy(2,alice.address,1,0);
       
       
       expect(await NFTInstance.balanceOf(alice.address,1)).to.equal(1);
       expect(await NFTInstance.balanceOf(alice.address,2)).to.equal(1);


      await SaleInstance.connect(artist).claimFunds(TokenInstance.address);
     

      await NFTInstance.connect(alice).setApprovalForAll(
        SaleInstance.address,
        true
      );
    
    
      await SaleInstance.connect(alice).createSale(
        NFTInstance.address,
        constants.one,
        constants.one,
        startTime,
        endTime,
        constants.sale.price,
        constants.sale.maxBuyAmount,
        TokenInstance.address
      );

      await SaleInstance.connect(chad).buy(3,chad.address,1,0);

      expect(await NFTInstance.balanceOf(chad.address,1)).to.equal(1);

      let royaltyFee = await NFTInstance.royaltyInfo(1,ethers.utils.parseUnits("100"));
     
      let artistBalBefore = await TokenInstance.balanceOf(artist.address);

      await SaleInstance.connect(artist).claimFunds(TokenInstance.address);
  
      let artistBalAfter = await TokenInstance.balanceOf(artist.address);
  
      expect(await artistBalAfter).to.equal(artistBalBefore.add(royaltyFee[1]));
  });

  it("purchase with hybrid ETH-like",async () => {

    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;

    // minting batch 
    await mintBatch(NFTInstance,owner,artist);

    // set bidders up with money
    await setBiddersUp(
        TokenInstance,
        SaleInstance,
        alice,
        bob,
        chad
      );

      
      let sellerBal = await NFTInstance.balanceOf(artist.address,1);
      expect(sellerBal).to.equal(1);

      let sellerBaltokenID2 = await NFTInstance.balanceOf(artist.address,2);
      expect(sellerBaltokenID2).to.equal(1);
     
    
      // creating sale
      await NFTInstance.connect(artist).setApprovalForAll(
        SaleInstance.address,
        true
      );
    
      // create sale for tokenID1
      await SaleInstance.connect(artist).createSale(
        NFTInstance.address,
        constants.one,
        constants.one,
        startTime,
        endTime,
        ethers.utils.parseUnits("2"),
        constants.sale.maxBuyAmount,
        constants.TEST.ETH
      );
  
      await SaleInstance.connect(alice).buy(1,alice.address,1,0,{
        value: ethers.utils.parseUnits("2", "ether")
    });
      expect(await NFTInstance.balanceOf(alice.address,1)).to.equal(1);

      // alice has the NFT and creates Sale

      await NFTInstance.connect(alice).setApprovalForAll(
        SaleInstance.address,
        true
      );

      await SaleInstance.connect(alice).createSale(
        NFTInstance.address,
        constants.one,
        constants.one,
        startTime,
        endTime,
        ethers.utils.parseUnits("3"),
        constants.sale.maxBuyAmount,
        constants.TEST.ETH
      );

      // artist buys back NFT from alice using his ETH balance plus external ETHs  
      await SaleInstance.connect(artist).buy(2,artist.address,1,ethers.utils.parseUnits("1.94", "ether"),{
        value: ethers.utils.parseUnits("1.06", "ether")
    });

    expect(await NFTInstance.balanceOf(artist.address,1)).to.equal(1);
    
  })
  it("purchase with hybrid ERC20(using ERC20 from wallet and from contract balance",async () => {
    let startTime = await currentTime();
    let endTime = startTime + constants.TEST.oneMonth;

    // minting batch 
    await mintBatch(NFTInstance,owner,artist);

    // set bidders up with money
    await setBiddersUp(
        TokenInstance,
        SaleInstance,
        alice,
        artist,
        chad
      );

      let sellerBal = await NFTInstance.balanceOf(artist.address,1);
      expect(sellerBal).to.equal(1);

      let sellerBalTokenID2 = await NFTInstance.balanceOf(artist.address,2);
      expect(sellerBalTokenID2).to.equal(1);
     
    
      // creating sale
      await NFTInstance.connect(artist).setApprovalForAll(
        SaleInstance.address,
        true
      );
    
      // create sale for tokenID1
      await SaleInstance.connect(artist).createSale(
        NFTInstance.address,
        constants.one,
        constants.one,
        startTime,
        endTime,
        constants.sale.price,
        constants.sale.maxBuyAmount,
        TokenInstance.address
      );

      await SaleInstance.connect(alice).buy(1,alice.address,1,0
    );
    await NFTInstance.connect(alice).setApprovalForAll(
      SaleInstance.address,
      true
    );

    await SaleInstance.connect(alice).createSale(
      NFTInstance.address,
      constants.one,
      constants.one,
      startTime,
      endTime,
      ethers.utils.parseUnits("200"),
      constants.sale.maxBuyAmount,
      TokenInstance.address
    );
    
    await SaleInstance.connect(artist).buy(2,artist.address,1,ethers.utils.parseUnits("92"));

  expect(await NFTInstance.balanceOf(artist.address,1)).to.equal(1);
   
  let aliceBalBefore = await TokenInstance.balanceOf(alice.address);
  let claimable = await SaleInstance.getClaimableBalance(alice.address,TokenInstance.address)
  await SaleInstance.connect(alice).claimFunds(TokenInstance.address);

  expect ( await TokenInstance.balanceOf(alice.address)).to.equal(aliceBalBefore.add(claimable))

  });
})
