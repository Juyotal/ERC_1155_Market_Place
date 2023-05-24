import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {  ethers, expect, constants } from "./constants.test";
import {
  whitelistArtist,
  currentTime,
  fastForward,
  setBiddersUp,
  setupSale,
  setupStatusSale
} from "./helpers.test";

let NFTContract: Contract;
let NFTInstance: any;

let SaleContract: Contract;
let SaleInstance: any;

let TokenContract: Contract;
let TokenInstance: any;

let RegistryContract: Contract;
let RegistryInstance: any;

let owner: SignerWithAddress;
let artist: SignerWithAddress;
let bidder1: SignerWithAddress;
let bidder2: SignerWithAddress;
let bidder3: SignerWithAddress;
let seller: SignerWithAddress;

const Status = {
  "PENDING": "PENDING",
  "ACTIVE": "ACTIVE",
  "ENDED": "ENDED",
  "ENDED_AND_CLAIMED": "ENDED & CLAIMED",
  "CANCELLED": "CANCELLED"
}

describe("Sale unit tests", function () {
  beforeEach(async () => {
    [owner,artist,bidder1,bidder2,bidder3,seller] = await ethers.getSigners();

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
    await RegistryInstance.connect(owner).setContractStatus(
      SaleInstance.address,
      true
    );
    await RegistryInstance.connect(owner).setCurrencyStatus(
      TokenInstance.address,
      true
    );

    await RegistryInstance.connect(owner).setSystemWallet(owner.address);
  });

  describe("view functions", () => {
    beforeEach(async () => {

    });

    it("getSaleDetails returns as expected", async() => {
      let startTime = await currentTime();
      let endTime = startTime + constants.TEST.oneMonth;
      await setupSale(
        NFTInstance, 
        SaleInstance, 
        TokenInstance.address,
        owner,
        seller
      );
  
      const details = await SaleInstance.connect(seller).getSaleDetails(1)
      expect(await details[0]).to.equal(1);
      expect(await details[1]).to.equal(seller.address);
      expect(await details[2]).to.equal(NFTInstance.address);
      expect(await details[3]).to.equal(1);
      expect(await details[4]).to.equal(constants.hundred);
      expect(await details[5]).to.equal(0);
      expect(await details[6]).to.equal(startTime);
      expect(await details[7]).to.equal(endTime);
      expect(await details[8]).to.equal(constants.sale.price);
      expect(await details[9]).to.equal(constants.sale.maxBuyAmount);
      expect(await details[10]).to.equal(TokenInstance.address);
    });

    it("getSaleDetails cannot check saleId that hasn't been created yet", async () => {
      await setupSale(
        NFTInstance, 
        SaleInstance, 
        TokenInstance.address,
        owner,
        seller,
      );
  
      await expect(SaleInstance.connect(seller).getSaleDetails(0)).to.be.revertedWith("sale does not exist")
      await expect(SaleInstance.connect(seller).getSaleDetails(100)).to.be.revertedWith("sale does not exist")
    });

    it("getSaleStatus: Pending", async () => {
      let startTime = await currentTime() + constants.TEST.oneDay;
      let endTime = await currentTime() + constants.TEST.oneMonth;

      await setupStatusSale(
            NFTInstance, 
            SaleInstance, 
            TokenInstance.address,
            owner,
            seller,
            startTime,
            endTime
      );
      const status = await SaleInstance.connect(seller).getSaleStatus(1)

      expect(status).to.equal("PENDING");
    });

    it("getSaleStatus: Active", async () => {
      let startTime = await currentTime();
      let endTime = await currentTime() + constants.TEST.oneMonth;

      await setupStatusSale(
            NFTInstance, 
            SaleInstance, 
            TokenInstance.address,
            owner,
            seller,
            startTime,
            endTime
      );
      let status = await SaleInstance.connect(seller).getSaleStatus(1)

      expect(status).to.equal("ACTIVE");
    });
    it("getSaleStatus: Ended", async () => {
      let startTime = await currentTime() - constants.TEST.oneMonth;
      let endTime = await currentTime() - constants.TEST.oneDay;

      await setupStatusSale(
            NFTInstance, 
            SaleInstance, 
            TokenInstance.address,
            owner,
            seller,
            startTime,
            endTime
      );
      let status = await SaleInstance.connect(seller).getSaleStatus(1)

      expect(status).to.equal("ENDED");
    });
    it("getSaleStatus: Cancelled", async () => {
        await setupSale(
            NFTInstance, 
            SaleInstance, 
            TokenInstance.address,
            owner,
            seller
        );

        await SaleInstance.connect(seller).cancelSale(1)
        let status = await SaleInstance.connect(seller).getSaleStatus(1)

        expect(status).to.equal("CANCELLED");

    });

    it("getSaleStatus cannot check saleId that hasn't been created yet", async () => {
        await expect(SaleInstance.connect(seller).getSaleStatus(1)).to.be.revertedWith("sale does not exist")
    });

    it("getClaimableBalance returns correct balance", async () => {

        await setupSale(
            NFTInstance, 
            SaleInstance, 
            TokenInstance.address,
            owner,
            seller
        );

        // A sale needs to be created, then we need to add a buyer in here
        // We need to send the buyer tokens and then the buyer needs to buy the NFT for sale
        // After that the buyer should be able to hit the getClaimableBalance function and claim the NFT
    });

  });
 
  describe("Sale creation", async () => {
    it("can set up two sales which overlap", async () => {
      
      // sale 1

      await setupSale(
        NFTInstance, 
        SaleInstance, 
        TokenInstance.address,
        owner,
        seller
    );

    // sale 2

  let startTime = await currentTime();
  let endTime = startTime + constants.TEST.oneMonth;

  await NFTInstance.connect(seller).mint(
    seller.address,
    constants.hundred,
    constants.nft.uri2
  );

  // creating sale
  await NFTInstance.connect(seller).setApprovalForAll(
    SaleInstance.address,
    true
  );

  await SaleInstance.connect(seller).createSale(
    NFTInstance.address,
    2,
    constants.hundred,
    startTime,
    endTime,
    constants.sale.price,
    constants.sale.maxBuyAmount,
    TokenInstance.address
  );


  await setBiddersUp(
    TokenInstance,
    SaleInstance,
    bidder1,
    bidder2,
    bidder3
  );
  
    // the same buyer can buy from two different sales simultaneously
  await SaleInstance.connect(bidder1).buy(1,bidder1.address, ethers.BigNumber.from("2"),0);
  await SaleInstance.connect(bidder1).buy(2,bidder1.address, ethers.BigNumber.from("4"),0);

  expect (await NFTInstance.balanceOf(bidder1.address,1)).to.equal( ethers.BigNumber.from("2"));
  expect (await NFTInstance.balanceOf(bidder1.address,2)).to.equal( ethers.BigNumber.from("4"));
    });
 
 it("cannot create sale if Sale contract is deprecated", async () => {

      await RegistryInstance.setContractStatus(SaleInstance.address,false);


  let startTime = await currentTime();
  let endTime = startTime + constants.TEST.oneMonth;

  // use next line if whitelisting is implemented
  await NFTInstance.connect(owner).setWhitelisted(seller.address, true);

  await NFTInstance.connect(seller).mint(
    seller.address,
    constants.hundred,
    constants.nft.uri2
  );

  // creating sale
  await NFTInstance.connect(seller).setApprovalForAll(
    SaleInstance.address,
    true
  );

  await expect( SaleInstance.connect(seller).createSale(
    NFTInstance.address,
    2,
    constants.hundred,
    startTime,
    endTime,
    constants.sale.price,
    constants.sale.maxBuyAmount,
    TokenInstance.address
  )).to.be.revertedWith("This contract is deprecated")

    });

it("cannot sell the same balance twice", async () => {

  let startTime = await currentTime();
  let endTime = startTime + constants.TEST.oneMonth;

  // use next line if whitelisting is implemented
  await NFTInstance.connect(owner).setWhitelisted(seller.address, true);

  await NFTInstance.connect(seller).mint(
    seller.address,
    constants.hundred,
    constants.nft.uri2
  );

  // creating sale
  await NFTInstance.connect(seller).setApprovalForAll(
    SaleInstance.address,
    true
  );

  await SaleInstance.connect(seller).createSale(
    NFTInstance.address,
    1,
    constants.hundred,
    startTime,
    endTime,
    constants.sale.price,
    constants.sale.maxBuyAmount,
    TokenInstance.address
  );

  await expect( SaleInstance.connect(seller).createSale(
    NFTInstance.address,
    1,
    constants.hundred,
    startTime,
    endTime,
    constants.sale.price,
    constants.sale.maxBuyAmount,
    TokenInstance.address
  )).to.be.revertedWith("insufficient NFT balance");
    });

  
it("cannot buy after sale ended", async () => {
      await setupSale(
        NFTInstance, 
        SaleInstance, 
        TokenInstance.address,
        owner,
        seller
    ); 

    fastForward(constants.TEST.oneMonth);

    await expect(SaleInstance.connect(bidder1).buy(1,bidder1.address, ethers.BigNumber.from("4"),0)).to.be.revertedWith("sale is not active");

    });


it("cannot make sale with NFT that isn't owned", async () => {

  let startTime = await currentTime();
  let endTime = startTime + constants.TEST.oneMonth;

  // use next line if whitelisting is implemented
  await NFTInstance.connect(owner).setWhitelisted(seller.address, true);

  await NFTInstance.connect(seller).mint(
    seller.address,
    constants.hundred,
    constants.nft.uri2
  );

  // creating sale
  await NFTInstance.connect(seller).setApprovalForAll(
    SaleInstance.address,
    true
  );

  await expect( SaleInstance.connect(seller).createSale(
    NFTInstance.address,
    2,
    constants.hundred,
    startTime,
    endTime,
    constants.sale.price,
    constants.sale.maxBuyAmount,
    TokenInstance.address
  )).to.be.revertedWith("insufficient NFT balance");
    });

    it("cannot make sale with non-platform NFT contract", async () => {
      const newInstance = await NFTContract.deploy("");
      // use next line if whitelisting is implemented
      await newInstance.connect(owner).setWhitelisted(seller.address, true);
      expect(await newInstance.balanceOf(seller.address, constants.one))
        .to.equal(ethers.constants.Zero);
      await newInstance.connect(owner).mint(
        seller.address, 
        constants.hundred, 
        constants.nft.uri
      );
      expect(await newInstance.balanceOf(seller.address, constants.one))
        .to.equal(constants.hundred);
      let startTime = await currentTime();
      let endTime = startTime + constants.TEST.oneMonth;
      await expect(SaleInstance.connect(seller).createSale(
        newInstance.address,
        constants.one,
        constants.hundred,
        startTime,
        endTime,
        constants.sale.price,
        constants.sale.maxBuyAmount,
        TokenInstance.address
      )).to.be.revertedWith("NFT not in approved contract");
    });
    it("cannot make sale with non-EIP2981 compliant NFT", async () => {
      const plainNFT = await ethers.getContractFactory("Mock1155");
      const plainNftInstance = await plainNFT.deploy();

      await RegistryInstance.connect(owner).setContractStatus(plainNftInstance.address, true);

      await plainNftInstance.connect(seller).mint(
        seller.address,
        constants.one,
        constants.hundred
      );
      expect(await plainNftInstance.balanceOf(seller.address, constants.one))
        .to.equal(constants.hundred);
      await plainNftInstance.connect(seller).setApprovalForAll(SaleInstance.address, true);
      let startTime = await currentTime();
      let endTime = startTime + constants.TEST.oneMonth;
      await expect(SaleInstance.connect(seller).createSale(
        plainNftInstance.address,
        constants.one,
        constants.hundred,
        startTime,
        endTime,
        constants.sale.price,
        constants.sale.maxBuyAmount,
        TokenInstance.address
      )).to.be.revertedWith("contract must support ERC2981");
    });
    it("start time must be before end time", async () => {
      let startTime = await currentTime();
      let endTime = startTime - constants.TEST.oneMonth;  // changed endTime backwards
    
      // use next line if whitelisting is implemented
      await NFTInstance.connect(owner).setWhitelisted(seller.address, true);
    
      await NFTInstance.connect(seller).mint(
        seller.address,
        constants.hundred,
        constants.nft.uri2
      );
    
      // creating sale
      await NFTInstance.connect(seller).setApprovalForAll(
        SaleInstance.address,
        true
      );
    
      await expect( SaleInstance.connect(seller).createSale(
        NFTInstance.address,
        2,
        constants.hundred,
        startTime,
        endTime,
        constants.sale.price,
        constants.sale.maxBuyAmount,
        TokenInstance.address
      )).to.be.revertedWith("insufficient NFT balance");
    });

    it("maxBuyAmount cannot be zero",async () => {

      const startTime = await currentTime();
      const endTime = startTime + constants.TEST.oneMonth;

      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );
  
      await NFTInstance.connect(seller).mint(
        seller.address,
        constants.hundred,
        constants.nft.uri
      );
   
      await expect(SaleInstance.connect(seller).createSale(
        NFTInstance.address,
        2,
        constants.hundred,
        startTime,
        endTime,
        constants.sale.price,
        0,
        TokenInstance.address
      )).to.be.revertedWith("maxBuyAmount must be non-zero");
    });
    it("cannot create Sale with unapproved currency", async () => {
      
      const startTime = await currentTime();
      const endTime = startTime + constants.TEST.oneMonth;

      // use next line if whitelisting is implemented
      await whitelistArtist(NFTInstance, owner, seller.address);

      await NFTInstance.connect(seller).mint(
        seller.address,
        constants.hundred,
        constants.nft.uri
      );
   // set Token contract to unapproved 
   await RegistryInstance.setCurrencyStatus(TokenInstance.address, false);

      await expect(SaleInstance.connect(seller).createSale(
        NFTInstance.address,
        2,
        constants.hundred,
        startTime,
        endTime,
        constants.sale.price,
        0,
        TokenInstance.address
      )).to.be.revertedWith("currency not supported");

    });
   
    it("can purchase multiple NFTs (all external funds, ERC20)",async () => {
      const startTime = await currentTime();
      const endTime = startTime + constants.TEST.oneMonth;

      // use next line if whitelisting is implemented
      await whitelistArtist(NFTInstance, owner, seller.address);

      await NFTInstance.connect(seller).mintBatch(
        seller.address,
        [5, constants.one],
        [constants.nft.uri, constants.nft.uri2]
      );
   

      const sellerBal = await NFTInstance.balanceOf(seller.address,1);

      await NFTInstance.connect(seller).setApprovalForAll(
        SaleInstance.address,
        true
      );
      

      await setBiddersUp(
        TokenInstance,
        SaleInstance,
        bidder1,
        bidder2,
        bidder3
      );

      await SaleInstance.connect(seller).createSale(
        NFTInstance.address,
        1,
        5,
        startTime,
        endTime,
        constants.sale.price,
        5,
        TokenInstance.address
      )

      await SaleInstance.connect(bidder2).buy(1, bidder2.address,ethers.BigNumber.from("5"), 0);

      expect (await NFTInstance.balanceOf(bidder2.address,1)).to.equal(ethers.BigNumber.from("5"));
    });
    it("seller's claimable balance is properly updated,system fees taken off",async () => {
      const startTime = await currentTime();
      const endTime = startTime + constants.TEST.oneMonth;

      // use next line if whitelisting is implemented
      await whitelistArtist(NFTInstance, owner, seller.address);

      await NFTInstance.connect(seller).mintBatch(
        seller.address,
        [5, constants.one],
        [constants.nft.uri, constants.nft.uri2]
      );
   

      const sellerBal = await NFTInstance.balanceOf(seller.address,1);

      await NFTInstance.connect(seller).setApprovalForAll(
        SaleInstance.address,
        true
      );
      

      await setBiddersUp(
        TokenInstance,
        SaleInstance,
        bidder1,
        bidder2,
        bidder3
      );

      await SaleInstance.connect(seller).createSale(
        NFTInstance.address,
        1,
        5,
        startTime,
        endTime,
        constants.sale.price,
        5,
        TokenInstance.address
      )

      await SaleInstance.connect(bidder2).buy(1, bidder2.address,ethers.BigNumber.from("5"), 0);

      let systemFees = await RegistryInstance.feeInfo(constants.sale.price);

    
      let systemFeeBatch = systemFees[1].mul(5);

      expect (await SaleInstance.getClaimableBalance(seller.address,TokenInstance.address)).to.equal((constants.sale.price.mul(5)).sub(systemFeeBatch))
    });
    it("cannot buy from nonexistent sale",async () => {
      //TODO check about revert message
      const startTime = await currentTime();
      const endTime = startTime + constants.TEST.oneMonth;

      // use next line if whitelisting is implemented
      await whitelistArtist(NFTInstance, owner, seller.address);

      await NFTInstance.connect(seller).mintBatch(
        seller.address,
        [5, constants.one],
        [constants.nft.uri, constants.nft.uri2]
      );

      await NFTInstance.connect(seller).setApprovalForAll(
        SaleInstance.address,
        true
      );
  

      await setBiddersUp(
        TokenInstance,
        SaleInstance,
        bidder1,
        bidder2,
        bidder3
      );

      await SaleInstance.connect(seller).createSale(
        NFTInstance.address,
        1,
        5,
        startTime,
        endTime,
        constants.sale.price,
        5,
        TokenInstance.address
      )

      await expect( SaleInstance.connect(bidder2).buy(2, bidder2.address,ethers.BigNumber.from("5"), 0)).to.be.revertedWith("sale does not exist")
    });
    it("cannot buy on deprecated contract",async () => {
      const startTime = await currentTime();
      const endTime = startTime + constants.TEST.oneMonth;

      // use next line if whitelisting is implemented
      await whitelistArtist(NFTInstance, owner, seller.address);

      await NFTInstance.connect(seller).mintBatch(
        seller.address,
        [5, constants.one],
        [constants.nft.uri, constants.nft.uri2]
      );
      const sellerBal = await NFTInstance.balanceOf(seller.address,1);

      await NFTInstance.connect(seller).setApprovalForAll(
        SaleInstance.address,
        true
      );
      

      await setBiddersUp(
        TokenInstance,
        SaleInstance,
        bidder1,
        bidder2,
        bidder3
      );

      // depricate NFT contract
       await RegistryInstance.connect(owner).setContractStatus(NFTInstance.address,false),

      await expect (SaleInstance.connect(seller).createSale(
        NFTInstance.address,
        1,
        5,
        startTime,
        endTime,
        constants.sale.price,
        5,
        TokenInstance.address
      )).to.be.revertedWith("NFT not in approved contract")
    });
    it("cannot buy if amount is more than remaining stock",async () => {
      const startTime = await currentTime();
      const endTime = startTime + constants.TEST.oneMonth;

      // use next line if whitelisting is implemented
      await whitelistArtist(NFTInstance, owner, seller.address);

      await NFTInstance.connect(seller).mintBatch(
        seller.address,
        [5, constants.one],
        [constants.nft.uri, constants.nft.uri2]
      );
   

      const sellerBal = await NFTInstance.balanceOf(seller.address,1);

      await NFTInstance.connect(seller).setApprovalForAll(
        SaleInstance.address,
        true
      );
      

      await setBiddersUp(
        TokenInstance,
        SaleInstance,
        bidder1,
        bidder2,
        bidder3
      );

      await SaleInstance.connect(seller).createSale(
        NFTInstance.address,
        1,
        5,
        startTime,
        endTime,
        constants.sale.price,
        5,
        TokenInstance.address
      )

      await expect( SaleInstance.connect(bidder2).buy(1, bidder2.address,ethers.BigNumber.from("6"), 0)).to.be.revertedWith("buy quantity too high")
    });
  });


  // TODO Mekyle
  describe("claim functions", () => {
    it("seller can reclaim unsold stock", async () => {
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );

      await SaleInstance.connect(seller).cancelSale(1)
      await SaleInstance.connect(seller).claimNfts(1)

      expect(await NFTInstance.connect(seller).balanceOf(seller.address, 1)).to.equal( ethers.BigNumber.from("100"))
    });
    it("non-seller cannot reclaim unsold NFTs", async () => {
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );

      await SaleInstance.connect(seller).cancelSale(1)
      await expect(SaleInstance.connect(bidder1).claimNfts(1)).to.be.revertedWith("only nft owner can claim")
    });
    it("seller can claim funds (ERC20)", async()=>{
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );
      await TokenInstance.mint(bidder1.address,ethers.utils.parseUnits("1000000000"));
      await TokenInstance.connect(bidder1).approve(SaleInstance.address, ethers.constants.MaxUint256);

      await SaleInstance.connect(bidder1).buy(1,bidder1.address, ethers.BigNumber.from("2"),0);
      await SaleInstance.connect(seller).claimFunds(TokenInstance.address)
      expect(await TokenInstance.connect(seller).balanceOf(seller.address)).to.equal(ethers.BigNumber.from("194000000000000000000"))
    });
    it("seller can claim funds (ETH)", async()=>{
      await setupSale(
        NFTInstance,
        SaleInstance,
        constants.TEST.ETH,
        owner,
        seller 
      );

      await SaleInstance.connect(bidder1).buy(
        1, 
        bidder1.address,
        ethers.BigNumber.from("1"), 
        0, 
        { value: ethers.utils.parseEther("100") }  
      );

      let balBefore = await seller.getBalance()
      let claimableBal = await SaleInstance.getClaimableBalance(seller.address,constants.TEST.ETH)
      let sumBal =  balBefore.add(claimableBal)

      await SaleInstance.connect(seller).claimFunds(constants.TEST.ETH)
      expect ( await seller.getBalance()).to.be.below(sumBal)

      // claim funds here, use constants.TEST.ETH for the token address
    });
    it("artist can claim royalties (ERC20)", async()=>{
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );
      await TokenInstance.mint(bidder1.address,ethers.utils.parseUnits("1000000000"));
      await TokenInstance.connect(bidder1).approve(SaleInstance.address, ethers.constants.MaxUint256);

      await SaleInstance.connect(bidder1).buy(
        1, 
        bidder1.address,
        ethers.BigNumber.from("1"), 
        0
      );

      let salePrice = constants.sale.price;
      let [, fee] = await RegistryInstance.feeInfo(salePrice);
      let [creator, _royalty] =  await NFTInstance.royaltyInfo(1, salePrice);
      let claimableBal = await SaleInstance.getClaimableBalance(creator, TokenInstance.address);
      let royalty = salePrice.sub(fee).sub(claimableBal);
      expect (creator).to.equal(seller.address)
      // seller is artist so royalty is ZERO
      expect (royalty).to.equal(0);

      // setting up second party sale to actually get a royalty fee
      let startTime = await currentTime();
      let endTime = startTime + constants.TEST.oneMonth;

      await NFTInstance.connect(bidder1).setApprovalForAll(
        SaleInstance.address,
        true
      );
      await SaleInstance.connect(bidder1).createSale(
        NFTInstance.address,
        constants.one,
        constants.one,
        startTime,
        endTime,
        constants.sale.price,
        1,
        TokenInstance.address
      );

      await TokenInstance.mint(bidder2.address,ethers.utils.parseUnits("1000000000"));
      await TokenInstance.connect(bidder2).approve(SaleInstance.address, ethers.constants.MaxUint256);
      await SaleInstance.connect(bidder2).buy(
        2, 
        bidder2.address,
        ethers.BigNumber.from("1"), 
        0
      );
      
      claimableBal = await SaleInstance.getClaimableBalance(bidder1.address, TokenInstance.address);
      royalty = salePrice.sub(fee).sub(claimableBal);
      // now, seller(creator) must have a royalty into their claimable since the nft was resold by the buyer!
      expect (royalty).to.equal(_royalty);
    });

    it("artist can claim royalties (ETH)", async () => {
      await setupSale(
        NFTInstance,
        SaleInstance,
        constants.TEST.ETH,
        owner,
        seller 
      );
   
      await SaleInstance.connect(bidder1).buy(
        1, 
        bidder1.address,
        ethers.BigNumber.from("1"), 
        0,
        { value: ethers.utils.parseEther("100") } 
      );

      let salePrice = constants.sale.price;
      let [, fee] = await RegistryInstance.feeInfo(salePrice);
      let [creator, _royalty] =  await NFTInstance.royaltyInfo(1, salePrice);
      let claimableBal = await SaleInstance.getClaimableBalance(creator, constants.TEST.ETH);
      let royalty = salePrice.sub(fee).sub(claimableBal);
      expect (creator).to.equal(seller.address)
      // seller is artist so royalty is ZERO
      expect (royalty).to.equal(0);

      // setting up second party sale to actually get a royalty fee
      let startTime = await currentTime();
      let endTime = startTime + constants.TEST.oneMonth;

      await NFTInstance.connect(bidder1).setApprovalForAll(
        SaleInstance.address,
        true
      );
      await SaleInstance.connect(bidder1).createSale(
        NFTInstance.address,
        constants.one,
        constants.one,
        startTime,
        endTime,
        constants.sale.price,
        1,
        constants.TEST.ETH
      );

      await SaleInstance.connect(bidder2).buy(
        2, 
        bidder2.address,
        ethers.BigNumber.from("1"), 
        0,
        { value: ethers.utils.parseEther("100") }
      );
      
      claimableBal = await SaleInstance.getClaimableBalance(bidder1.address, constants.TEST.ETH);
      royalty = salePrice.sub(fee).sub(claimableBal);
      // now, seller(creator) must have a royalty into their claimable since the nft was resold by the buyer!
      expect (royalty).to.equal(_royalty);
    });

    it("system can claim fees (ERC20)", async () => {
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );
      await TokenInstance.mint(bidder1.address,ethers.utils.parseUnits("1000000000"));
      await TokenInstance.connect(bidder1).approve(SaleInstance.address, ethers.constants.MaxUint256);

      await SaleInstance.connect(bidder1).buy(
        1, 
        bidder1.address,
        ethers.BigNumber.from("1"), 
        0
      );

      let salePrice = constants.sale.price;
      let [_systemWallet, _fee] = await RegistryInstance.feeInfo(salePrice);
      let claimableBal = await SaleInstance.getClaimableBalance(seller.address, TokenInstance.address);
      let fee = salePrice.sub(claimableBal);
      let systemBalance = await SaleInstance.getClaimableBalance(_systemWallet, TokenInstance.address);

      expect (fee).to.equal(_fee).to.equal(systemBalance);
    });

    it("system can claim fees (ETH)", async() => {
      await setupSale(
        NFTInstance,
        SaleInstance,
        constants.TEST.ETH,
        owner,
        seller 
      );

      await SaleInstance.connect(bidder1).buy(
        1, 
        bidder1.address,
        ethers.BigNumber.from("1"), 
        0,
        { value: ethers.utils.parseEther("100") }
      );

      let salePrice = constants.sale.price;
      let [_systemWallet, _fee] = await RegistryInstance.feeInfo(salePrice);
      let claimableBal = await SaleInstance.getClaimableBalance(seller.address, constants.TEST.ETH);
      let fee = salePrice.sub(claimableBal);
      let systemBalance = await SaleInstance.getClaimableBalance(_systemWallet, constants.TEST.ETH);

      expect (fee).to.equal(_fee).to.equal(systemBalance);
    });

    it("cannot claim 0", async () => {
      await setupSale(
        NFTInstance,
        SaleInstance,
        constants.TEST.ETH,
        owner,
        seller 
      );
      
      await expect (SaleInstance.connect(seller).claimFunds(constants.TEST.ETH)).to.be.revertedWith("nothing to claim"); 
      await SaleInstance.connect(bidder1).buy(
        1, 
        bidder1.address,
        ethers.BigNumber.from("1"), 
        0,
        { value: ethers.utils.parseEther("100") }
      );
      await SaleInstance.connect(seller).claimFunds(constants.TEST.ETH)
    });

  });

  // TODO Mekyle
  describe("cancellation", () => {
    it("seller can cancel sale", async()=>{
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );
      await SaleInstance.connect(seller).cancelSale(1)
      expect( await SaleInstance.connect(seller).getSaleStatus(1)).to.equal('CANCELLED');
    });
    it("non-seller can't cancel", async () => {
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );
 
      await expect(SaleInstance.connect(bidder1).cancelSale(1)).to.be.revertedWith("only owner or sale creator")
    });
    it("cannot purchase from cancelled", async () => {
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );
      await SaleInstance.connect(seller).cancelSale(1)
      await expect( SaleInstance.connect(bidder1).buy(
        constants.one,
        bidder1.address,
        constants.one,
        constants.hundred,
      )).to.be.revertedWith("sale is not active")

    });
    it("artist can claim unsold NFTs after cancel", async ()=>{
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );
      await SaleInstance.connect(seller).cancelSale(1)
      await SaleInstance.connect(seller).claimNfts(1)
      expect (await NFTInstance.balanceOf(seller.address,1)).to.equal( ethers.BigNumber.from("100"));
    });

    // TODO Zsofie - addon tests 
    it("non-owner cannot claim NFT", async ()=>{
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );

      await SaleInstance.connect(seller).cancelSale(1);

      await expect(SaleInstance.connect(bidder2).claimNfts(1)).to.be.revertedWith("only nft owner can claim")
    })
    it("owner cannot claim NFTs back if stock is sold out", async ()=>{
      
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );

      await setBiddersUp(
        TokenInstance,
        SaleInstance,
        bidder1,
        bidder2,
        bidder3
      );

      await SaleInstance.connect(bidder2).buy(1, bidder2.address,constants.sale.maxBuyAmount, 0);
  
      await fastForward(constants.TEST.oneMonth);
      
      // seller has to claim back the remaining 90 NFTs first
      await SaleInstance.connect(seller).claimNfts(1);
      //he tries to claim the 10 sold back
      await expect(SaleInstance.connect(seller).claimNfts(1)).to.be.revertedWith("stock already sold or claimed")
   
     })
    it("owner can't claim remaining NFTs back twice after sale ended", async ()=>{ 
      await setupSale(
        NFTInstance,
        SaleInstance,
        TokenInstance.address,
        owner,
        seller 
      );
      await fastForward(constants.TEST.oneMonth)
      await SaleInstance.connect(seller).claimNfts(1)
      expect (await NFTInstance.balanceOf(seller.address,1)).to.equal( ethers.BigNumber.from("100"));
    

    await expect(SaleInstance.connect(seller).claimNfts(1)).to.be.revertedWith("stock already sold or claimed")
    })
 
    it("in buy if msg.value + amountFromBalance is != price *amountToBuy an error will be thrown", async ()=>{ 
   
  });

  it("seller can't claim funds twice", async ()=>{
    await setupSale(
      NFTInstance,
      SaleInstance,
      TokenInstance.address,
      owner,
      seller 
    );

    await setBiddersUp(
      TokenInstance,
      SaleInstance,
      bidder1,
      bidder2,
      bidder3
    );


    await SaleInstance.connect(bidder1).buy(
      constants.one,
      bidder1.address,
      constants.sale.maxBuyAmount,
      0,
    )

    await SaleInstance.connect(seller).claimFunds(TokenInstance.address);

    await expect(SaleInstance.connect(seller).claimFunds(TokenInstance.address)).to.be.revertedWith("nothing to claim");

   });

   
});
})