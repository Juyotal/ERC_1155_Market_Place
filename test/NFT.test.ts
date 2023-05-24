import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { hre, ethers, expect, constants } from "./constants.test";
import { 
  deployNft,
  whitelistArtist,
  mintSingleNft,
  setNftDetails,
  exemptFromRoyalties,
  mintBatch
 } from "./helpers.test";


describe("NFT Contract tests", () => {
  let owner: SignerWithAddress, artist: SignerWithAddress, buyer: SignerWithAddress;

  let Nft: Contract;

  beforeEach(async () => {
    // Put logic that will be needed before every test
    [owner, artist, buyer] = await ethers.getSigners();

    Nft = await deployNft(owner);
  });

  describe("general view functions", () => {
    it("displays uri properly", async () => {
      await whitelistArtist(Nft, owner, artist.address);
      await mintSingleNft(Nft, artist);

      expect(await Nft.uri(constants.one))
        .to.equal(constants.nft.uri);
    });
  })

  describe("whitelist and mint tests", () => {
    beforeEach(async () => {
      await Nft.connect(owner).setWhitelisted(artist.address, true);
    });

    
    it("checks if user is whitelisted", async () => {
      const isWhitelisted = await Nft.getWhitelisted(artist.address);
      expect(isWhitelisted).to.be.true;
    });

    it("checks if user is not whitelisted", async () => {
      const isWhitelisted = await Nft.getWhitelisted(buyer.address);
      expect(isWhitelisted).to.be.false;
    });

    // Checks that the Artist is the only that can whitelist
    it("owner can whitelist a user", async () => {
      const isWhitelisted = await Nft.getWhitelisted(artist.address);
      expect(isWhitelisted).to.be.true;
    });

    // Checks if a non-owner can whitelist an artist 
    it("non-owner cannot whitelist a user", async () => {
      expect(await Nft.getWhitelisted(buyer.address)).to.be.false;
      await expect(
        Nft.connect(buyer).setWhitelisted(buyer.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("owner can remove from whitelist", async () => {
      expect(await Nft.getWhitelisted(artist.address))
        .to.be.true;
      
      await Nft.connect(owner).setWhitelisted(artist.address, false);

      expect(await Nft.getWhitelisted(artist.address))
        .to.be.false;
    });

    it("owner should be automatically whitelisted", async () => {
      expect(await Nft.getWhitelisted(owner.address))
        .to.be.true;
    });

    it("mint if whitelisted (artist)", async () => {
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(ethers.constants.Zero);
      await Nft.connect(artist).mint(buyer.address, "1", constants.nft.uri);
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(constants.one);
    });

    it("mint if whitelisted (owner)", async () => {
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(ethers.constants.Zero);
      await Nft.connect(owner).mint(buyer.address, "1", constants.nft.uri);
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(ethers.BigNumber.from("1"));
    });

    it("don't mint if not whitelisted", async () => {
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(ethers.constants.Zero);
      await expect(Nft.connect(buyer).mint(buyer.address, "1", constants.nft.uri))
        .to.be.revertedWith("not authorized to mint");
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(ethers.constants.Zero);
    });

    it("batch mint if whitelisted (artist)", async () => {
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(ethers.constants.Zero);
      await Nft.connect(artist).mintBatch(
        buyer.address, 
        [ethers.BigNumber.from("1")],
        [constants.nft.uri]
      );
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(ethers.BigNumber.from("1"));
    });

    it("batch mint if whitelisted (owner)", async () => {
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(ethers.constants.Zero);
      await Nft.connect(owner).mintBatch(
        buyer.address, 
        [constants.one],
        [constants.nft.uri]
      );
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(constants.one);
    });

    it("don't batch mint if not whitelisted", async () => {
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(ethers.constants.Zero);
      await expect(Nft.connect(buyer).mintBatch(
        buyer.address, 
        [constants.one],
        [constants.nft.uri]
      )).to.be.revertedWith("not authorized to mint");
      expect(await Nft.balanceOf(buyer.address, "1")).to.equal(ethers.constants.Zero);
    });
  });

  describe("approval and transfer tests", () => {
    it("can approve operator on all NFTs", async () => {
      expect(await Nft.isApprovedForAll(artist.address, buyer.address))
        .to.be.false;

      await Nft.connect(artist).setApprovalForAll(buyer.address, true);

      expect(await Nft.isApprovedForAll(artist.address, buyer.address))
        .to.be.true;
    });

    it("approved can transfer NFTs", async () => {
      await whitelistArtist(Nft, owner, artist.address);
      await mintSingleNft(Nft, artist);

      expect(await Nft.isApprovedForAll(artist.address, buyer.address))
        .to.be.false;

      await Nft.connect(artist).setApprovalForAll(buyer.address, true);

      expect(await Nft.isApprovedForAll(artist.address, buyer.address))
        .to.be.true;
      expect(await Nft.balanceOf(buyer.address, constants.one))
        .to.equal(ethers.constants.Zero);

      await Nft.connect(buyer).safeTransferFrom(
        artist.address,
        buyer.address,
        constants.one,
        constants.one,
        "0x"
      );

      expect(await Nft.balanceOf(buyer.address, constants.one))
        .to.equal(constants.one);
    });

    it("safeTransferFrom works properly", async () => {
      await whitelistArtist(Nft, owner, artist.address);
      await mintSingleNft(Nft, artist);

      expect(await Nft.balanceOf(artist.address, constants.one))
        .to.equal(constants.one);
      expect(await Nft.balanceOf(buyer.address, constants.one))
        .to.equal(ethers.constants.Zero);

      await Nft.connect(artist).safeTransferFrom(
        artist.address,
        buyer.address,
        constants.one,
        constants.one,
        "0x"
      );

      expect(await Nft.balanceOf(artist.address, constants.one))
        .to.equal(ethers.constants.Zero);
      expect(await Nft.balanceOf(buyer.address, constants.one))
        .to.equal(constants.one);
    });

    it("safeBatchTransferFrom works properly", async () => {
      await mintBatch(Nft, owner, artist);

      expect(await Nft.balanceOf(artist.address, constants.one))
        .to.equal(constants.one);
      expect(await Nft.balanceOf(buyer.address, constants.one))
        .to.equal(ethers.constants.Zero);
      expect(await Nft.balanceOf(artist.address, ethers.BigNumber.from("2")))
        .to.equal(constants.one);
      expect(await Nft.balanceOf(buyer.address, ethers.BigNumber.from("2")))
        .to.equal(ethers.constants.Zero);

      await Nft.connect(artist).safeBatchTransferFrom(
        artist.address,
        buyer.address,
        [constants.one, ethers.BigNumber.from("2")],
        [constants.one, constants.one],
        "0x"
      );

      expect(await Nft.balanceOf(artist.address, constants.one))
        .to.equal(ethers.constants.Zero);
      expect(await Nft.balanceOf(buyer.address, constants.one))
        .to.equal(constants.one);
      expect(await Nft.balanceOf(artist.address, ethers.BigNumber.from("2")))
        .to.equal(ethers.constants.Zero);
      expect(await Nft.balanceOf(buyer.address, ethers.BigNumber.from("2")))
        .to.equal(constants.one);
    });
  });
  

  describe("royalty information", () => {
    beforeEach(async () => {
      await whitelistArtist(Nft, owner, artist.address);
      await mintSingleNft(Nft, artist);
    });

    it("displays royalty information properly", async () => {
      const royaltyInfo = await Nft.royaltyInfo(constants.one, ethers.utils.parseEther("100"));
      expect(royaltyInfo[0]).to.equal(artist.address);
      expect(royaltyInfo[1]).to.equal(ethers.utils.parseEther("5"));
    });

    it("returns global royalty properly", async () => {
      const [rate, scale] = await Nft.getRoyaltyRate();
      expect(rate).to.equal(ethers.BigNumber.from("500"));
      expect(scale).to.equal(ethers.BigNumber.from("10000"));
    })

    it("owner can set royalty rate", async () => {
      const [rate, scale] = await Nft.getRoyaltyRate();
      expect(rate).to.equal(ethers.BigNumber.from("500"));
      expect(scale).to.equal(ethers.BigNumber.from("10000"));

      await Nft.connect(owner).setRoyalty(ethers.BigNumber.from("200"), ethers.BigNumber.from("1000"));

      const [newRate, newScale] = await Nft.getRoyaltyRate();
      expect(newRate).to.equal(ethers.BigNumber.from("200"));
      expect(newScale).to.equal(ethers.BigNumber.from("1000"));
    });

    it("non-owner cannot set royalty rate", async () => {
      await expect(Nft.connect(artist).setRoyalty(ethers.BigNumber.from("200"), ethers.BigNumber.from("1000")))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("displays if an address is exempt from royalties on a particular NFT", async () => {
      // tested inside helper function
      await exemptFromRoyalties(Nft, artist, buyer.address);
    });

    it("NFT creator can exempt from royalties", async () => {
      // tested inside helper function
      await exemptFromRoyalties(Nft, artist, buyer.address);
    });

    it("non-NFT owner cannot exempt from royalties", async () => {
      await expect(Nft.connect(owner).setRoyaltyExemption(constants.one, owner.address, true))
        .to.be.revertedWith("NFT: only NFT creator");
    });

    it("royalty exemptions cannot be set on an unminted NFT", async () => {
      await expect(Nft.connect(owner).setRoyaltyExemption(ethers.BigNumber.from("2"), buyer.address, true))
        .to.be.revertedWith("NFT: only NFT creator");
    });
  });

  describe("NFT properties", () => {
    beforeEach(async () => {
      await whitelistArtist(Nft, owner, artist.address);
    });

    it("returns NFT properties properly", async () => {
      // helper function tests all three members of properties
      await setNftDetails(Nft, artist);
    });

    it("can set NFT properties (artist)", async () => {
      // this is also tested in the helper
      await setNftDetails(Nft, artist);
    });

    it("can set NFT properties (owner)", async () => {
      await mintSingleNft(Nft, artist);
      await Nft.connect(owner).setRedeem(constants.one, constants.nft.redeemDetails, true);
    });

    it("can switch flag (_redeemable) without updating description", async () => {
      await setNftDetails(Nft, artist);
      await Nft.connect(owner).setRedeem(constants.one, "", false);

      const properties = await Nft.getNftProperties(constants.one);
      expect(properties.redeemDescrip).to.equal(constants.nft.redeemDetails);
    });
  });

  describe("interface tests", () => {
    it("returns true for EIP1155", async () => {
      let interface1155 = 0xd9b67a26;
      expect(await Nft.supportsInterface(interface1155))
        .to.be.true;
    });

    it("returns true for EIP1155MetadataURI", async () => {
      let interface1155Metadata = 0x0e89341c;
      expect(await Nft.supportsInterface(interface1155Metadata))
        .to.be.true;
    });

    it("returns true for EIP2981", async () => {
      let interface2981 = 0x2a55205a;
      expect(await Nft.supportsInterface(interface2981))
        .to.be.true;
    });

    it("returns true for EIP165", async () => {
      let interface165 = 0x01ffc9a7;
      expect(await Nft.supportsInterface(interface165))
        .to.be.true;
    });
  })

  describe("event tests", () => {
    it("TransferSingle emitted properly (transfer)", async () => {
      await whitelistArtist(Nft, owner, artist.address);
      await mintSingleNft(Nft, artist);

      await expect(Nft.connect(artist).safeTransferFrom(
        artist.address,
        buyer.address,
        constants.one,
        constants.one,
        "0x"
      )).to.emit(Nft, 'TransferSingle')
        .withArgs(
          artist.address, 
          artist.address, 
          buyer.address, 
          constants.one, 
          constants.one
        );
    });

    it("TransferSingle emitted properly (mint)", async () => {
      await whitelistArtist(Nft, owner, artist.address);

      await expect(Nft.connect(artist).mint(
        artist.address,
        constants.one,
        constants.nft.uri
      )).to.emit(Nft, 'TransferSingle')
        .withArgs(
          artist.address, 
          ethers.constants.AddressZero, 
          artist.address, 
          constants.one, 
          constants.one
        );
    });

    it("TransferBatch emitted properly (transfer)", async () => {
      await mintBatch(Nft, owner, artist);

      await expect(Nft.connect(artist).safeBatchTransferFrom(
        artist.address,
        buyer.address,
        [constants.one, ethers.BigNumber.from("2")],
        [constants.one, constants.one],
        "0x"
      )).to.emit(Nft, "TransferBatch")
        .withArgs(
          artist.address,
          artist.address,
          buyer.address,
          [constants.one, ethers.BigNumber.from("2")],
          [constants.one, constants.one]
        );
    });

    it("TransferBatch emitted properly (mint)", async () => {
      await whitelistArtist(Nft, owner, artist.address);

      await expect(Nft.connect(artist).mintBatch(
        artist.address,
        [constants.one, constants.one],
        [constants.nft.uri, constants.nft.uri2]
      )).to.emit(Nft, "TransferBatch")
        .withArgs(
          artist.address,
          ethers.constants.AddressZero,
          artist.address,
          [constants.one, ethers.BigNumber.from("2")],
          [constants.one, constants.one]
        );
    });

    it("ApprovalForAll emitted properly", async () => {
      expect(await Nft.isApprovedForAll(artist.address, buyer.address))
        .to.be.false;

      await expect(Nft.connect(artist).setApprovalForAll(buyer.address, true))
        .to.emit(Nft, "ApprovalForAll")
        .withArgs(artist.address, buyer.address, true);

      expect(await Nft.isApprovedForAll(artist.address, buyer.address))
        .to.be.true;
    });

    it("RedeemDetailsSet emitted properly", async () => {
      await whitelistArtist(Nft, owner, artist.address);
      await mintSingleNft(Nft, artist);

      const origProps = await Nft.getNftProperties(constants.one);
      expect(origProps.creator).to.equal(artist.address);
      expect(origProps.isRedeemable).to.be.false;
      expect(origProps.redeemDescrip).to.equal("");

      await expect(Nft.connect(artist).setRedeem(
        constants.one,
        constants.nft.redeemDetails,
        true
      )).to.emit(Nft, "RedeemDetailsSet")
        .withArgs(constants.one, true, constants.nft.redeemDetails)

      const postProps = await Nft.getNftProperties(constants.one);
      expect(postProps.creator).to.equal(artist.address);
      expect(postProps.isRedeemable).to.be.true;
      expect(postProps.redeemDescrip).to.equal(constants.nft.redeemDetails);
    });

    it("WhitelistUpdated emitted properly", async () => {
      await expect(Nft.connect(owner).setWhitelisted(artist.address, true))
        .to.emit(Nft, "WhitelistUpdated")
        .withArgs(artist.address, true);
    });

    it("RoyaltyDetailsSet emitted properly", async () => {
      await expect(Nft.connect(owner).setRoyalty(
        ethers.BigNumber.from("20"),
        ethers.BigNumber.from("1000")
      )).to.emit(Nft, "RoyaltyDetailsSet")
        .withArgs(ethers.BigNumber.from("20"), ethers.BigNumber.from("1000"));
    });

    it("RoyaltyExemptionModified emitted properly", async () => {
      await whitelistArtist(Nft, owner, artist.address);
      await mintSingleNft(Nft, artist);

      await expect(Nft.connect(artist).setRoyaltyExemption(
        constants.one,
        buyer.address,
        true
      )).to.emit(Nft, "RoyaltyExemptionModified")
        .withArgs(constants.one, buyer.address, true);
    });

    it("URI emitted properly", async () => {
      await whitelistArtist(Nft, owner, artist.address);

      await expect(Nft.connect(artist).mint(
        artist.address,
        constants.one,
        constants.nft.uri
      )).to.emit(Nft, "URI")
        .withArgs(constants.nft.uri, constants.one);
    });
  });

  describe("dynamic error message tests", () => {
    it("cannot set whitelist status to same as present", async () => {
      expect(await Nft.getWhitelisted(artist.address))
        .to.be.false;
      await expect(Nft.connect(owner).setWhitelisted(artist.address, false))
        .to.be.revertedWith("whitelist status is already false");

      await whitelistArtist(Nft, owner, artist.address);

      expect(await Nft.getWhitelisted(artist.address))
        .to.be.true;
      await expect(Nft.connect(owner).setWhitelisted(artist.address, true))
        .to.be.revertedWith("whitelist status is already true");
    });

    it("cannot set royalty exemption to same as present", async () => {
      await whitelistArtist(Nft, owner, artist.address);
      await mintSingleNft(Nft, artist);
      expect(await Nft.isExemptFromRoyalties(constants.one, buyer.address))
        .to.be.false;
      await expect(Nft.connect(artist).setRoyaltyExemption(constants.one, buyer.address, false))
        .to.be.revertedWith("royalty status is already false");

      await Nft.connect(artist).setRoyaltyExemption(constants.one, buyer.address, true);

      expect(await Nft.isExemptFromRoyalties(constants.one, buyer.address))
        .to.be.true;
      await expect(Nft.connect(artist).setRoyaltyExemption(constants.one, buyer.address, true))
        .to.be.revertedWith("royalty status is already true");
    });
  })
});