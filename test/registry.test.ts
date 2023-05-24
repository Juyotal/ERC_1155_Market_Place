import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { hre, ethers, expect, constants } from "./constants.test";

let SaleContract: Contract;
let SaleInstance: any;

let RegistryContract: Contract;
let RegistryInstance: any;

let TokenContract: Contract;
let TokenInstance: any;

let owner: SignerWithAddress;
let mallory: SignerWithAddress;

describe("Registry unit tests", () => {
  beforeEach(async () => {
    [owner, mallory] = await ethers.getSigners()

    RegistryContract = await ethers.getContractFactory("Registry");
    RegistryInstance = await RegistryContract.deploy();

    SaleContract = await ethers.getContractFactory("NFTSale");
    SaleInstance = await SaleContract.deploy(RegistryInstance.address);

    TokenContract = await ethers.getContractFactory("MockERC20");
    TokenInstance = await TokenContract.deploy();

    await RegistryInstance.connect(owner).setSystemWallet(owner.address);
    await RegistryInstance.connect(owner).setContractStatus(SaleInstance.address, true);
  });

  describe("view functions", () => {
    it("returns if contract is supported", async () => {
      expect(await RegistryInstance.isPlatformContract(SaleInstance.address))
        .to.be.true;
    });
    it("returns if contract is not supported", async () => {
      await RegistryInstance.connect(owner).setContractStatus(SaleInstance.address, false);
      expect(await RegistryInstance.isPlatformContract(SaleInstance.address))
        .to.be.false;

      const newInstance = await SaleContract.deploy(RegistryInstance.address);

      expect(await RegistryInstance.isPlatformContract(newInstance.address))
        .to.be.false;
    });
    it("returns if token is approved (whitelist)", async () => {
      expect(await RegistryInstance.isApprovedCurrency(constants.TEST.ETH))
        .to.be.true;

      await RegistryInstance.connect(owner).setCurrencyStatus(TokenInstance.address, true);
      expect(await RegistryInstance.isApprovedCurrency(TokenInstance.address))
        .to.be.true;
    });
    it("returns if token is not approved (whitelist)", async () => {
      expect(await RegistryInstance.isApprovedCurrency(TokenInstance.address))
        .to.be.false;

      await RegistryInstance.setCurrencyStatus(constants.TEST.ETH, false);
      expect(await RegistryInstance.isApprovedCurrency(constants.TEST.ETH))
        .to.be.false;
    });
    it("returns if token is approved (global approval)", async () => {
      await RegistryInstance.connect(owner).approveAllCurrencies();
      expect(await RegistryInstance.isApprovedCurrency(TokenInstance.address))
        .to.be.true;
    });
    it("returns fee info properly", async () => {
      const feeInfo = await RegistryInstance.feeInfo(ethers.utils.parseEther("100"));
      expect(feeInfo[0]).to.equal(owner.address);
      expect(feeInfo[1]).to.equal(ethers.utils.parseEther("3"));
    });
  });

  describe("setter functions", () => {
    it("can set system wallet", async () => {
      await RegistryInstance.connect(owner).setSystemWallet(ethers.constants.AddressZero);
      const feeInfo = await RegistryInstance.feeInfo(ethers.utils.parseEther("100"));
      expect(feeInfo[0]).to.equal(ethers.constants.AddressZero);
    });
    it("can set fee vars", async () => {
      await RegistryInstance.connect(owner).setFeeVariables(
        5000,
        1e5
      );
      const feeInfo = await RegistryInstance.feeInfo(ethers.utils.parseEther("100"));
      expect(feeInfo[0]).to.equal(owner.address);
      expect(feeInfo[1]).to.equal(ethers.utils.parseEther("5"));
    });
    it("can set contract status: true", async () => {
      const newInstance = await SaleContract.deploy(RegistryInstance.address);
      await RegistryInstance.connect(owner).setContractStatus(newInstance.address, true);

      expect(await RegistryInstance.isPlatformContract(newInstance.address))
        .to.be.true;
    });
    it("can set contract status: false", async () => {
      await RegistryInstance.connect(owner).setContractStatus(SaleInstance.address, false);
      expect(await RegistryInstance.isPlatformContract(SaleInstance.address))
        .to.be.false;
    });
    it("cannot set contract to same status", async () => {
      const newInstance = await SaleContract.deploy(RegistryInstance.address);
      await expect(RegistryInstance.connect(owner).setContractStatus(SaleInstance.address, true))
        .to.be.revertedWith("contract status is already true");
      await expect(RegistryInstance.connect(owner).setContractStatus(newInstance.address, false))
        .to.be.revertedWith("contract status is already false");
    });
    it("can set single currency: true", async () => {
      await RegistryInstance.connect(owner).setCurrencyStatus(TokenInstance.address, true);
      expect(await RegistryInstance.isApprovedCurrency(TokenInstance.address))
        .to.be.true;
    });
    it("can set single currency: false", async () => {
      await RegistryInstance.setCurrencyStatus(constants.TEST.ETH, false);
      expect(await RegistryInstance.isApprovedCurrency(constants.TEST.ETH))
        .to.be.false;
    });
    it("cannot set currency to same status", async () => {
      await expect(RegistryInstance.setCurrencyStatus(constants.TEST.ETH, true))
        .to.be.revertedWith("token status is already true");
      await expect(RegistryInstance.connect(owner).setCurrencyStatus(TokenInstance.address, false))
        .to.be.revertedWith("token status is already false");
    });
    it("cannot set currency after global approval", async () => {
      await RegistryInstance.connect(owner).approveAllCurrencies();
      await expect(RegistryInstance.connect(owner).setCurrencyStatus(TokenInstance.address, true))
        .to.be.revertedWith("all currencies approved");
    });;
    it("cannot enable all twice", async () => {
      await RegistryInstance.connect(owner).approveAllCurrencies();
      await expect(RegistryInstance.connect(owner).approveAllCurrencies())
        .to.be.revertedWith("already approved");
    });
  });

  describe("ownable tests", () => {
    it("non-owner cannot set system wallet", async () => {
      await expect(RegistryInstance.connect(mallory).setSystemWallet(mallory.address))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });
    it("non-owner cannot set fee vars", async () => {
      await expect(RegistryInstance.connect(mallory).setFeeVariables(
        5000,
        1e5
      )).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it("non-owner cannot set contract status", async () => {
      await expect(RegistryInstance.connect(mallory).setContractStatus(SaleInstance.address, true))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });
    it("non-owner cannot set currency status", async () => {
      await expect(RegistryInstance.connect(mallory).setCurrencyStatus(TokenInstance.address, true))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });
    it("non-owner cannot globally whitelist tokens", async () => {
      await expect(RegistryInstance.connect(mallory).approveAllCurrencies())
        .to.be.revertedWith('Ownable: caller is not the owner');
    });
  })

  describe("event tests", () => {
    it("emits SystemWalletUpdated properly", async () => {
      await expect(RegistryInstance.connect(owner).setSystemWallet(mallory.address))
        .to.emit(RegistryInstance, "SystemWalletUpdated")
        .withArgs(mallory.address);
    });
    it("emits FeeVariablesChanged properly", async () => {
      await expect(RegistryInstance.connect(owner).setFeeVariables(
        5000,
        1e5
      )).to.emit(RegistryInstance, "FeeVariablesChanged")
        .withArgs(5000, 1e5);
    });
    it("emits ContractStatusChanged properly", async () => {
      await expect(RegistryInstance.connect(owner).setContractStatus(SaleInstance.address, false))
        .to.emit(RegistryInstance, "ContractStatusChanged")
        .withArgs(SaleInstance.address, false);

      await expect(RegistryInstance.connect(owner).setContractStatus(SaleInstance.address, true))
        .to.emit(RegistryInstance, "ContractStatusChanged")
        .withArgs(SaleInstance.address, true);
    });
    it("emits CurrencyStatusChanged properly", async () => {
      await expect(RegistryInstance.connect(owner).setCurrencyStatus(TokenInstance.address, true))
        .to.emit(RegistryInstance, "CurrencyStatusChanged")
        .withArgs(TokenInstance.address, true);

      await expect(RegistryInstance.connect(owner).setCurrencyStatus(TokenInstance.address, false))
        .to.emit(RegistryInstance, "CurrencyStatusChanged")
        .withArgs(TokenInstance.address, false);
    });
    it("emits CurrencyStatusChanged to the zero address on global approve", async () => {
      await expect(RegistryInstance.connect(owner).approveAllCurrencies())
        .to.emit(RegistryInstance, "CurrencyStatusChanged")
        .withArgs(ethers.constants.AddressZero, true);
    });
  })
})