import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { FakeToken1, RaiseToken, SaleERC20, SaleFactory, Staking } from "../typechain";

enum SaleType {
    ERC20 = 0,
    ERC1155 = 1
  }

let raiseToken: RaiseToken;
let fakeToken1: FakeToken1;
let saleFactory: SaleFactory;
let saleERC20Implementation: SaleERC20;
let owner: SignerWithAddress;
let raiseAdmin: SignerWithAddress;
let user1: SignerWithAddress;

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const SERVICE_FEE = 0;
const minimumAmountToFund = 0;
let projectTokenDecimals: number;

describe("Sale factory", function () {
  this.beforeEach(async () => {
    const RaiseToken = await ethers.getContractFactory("RaiseToken");
    raiseToken = await RaiseToken.deploy();

    const FakeToken1 = await ethers.getContractFactory("FakeToken1");
    fakeToken1 = await FakeToken1.deploy();

    const SaleERC20Implementation = await ethers.getContractFactory("SaleERC20");
    saleERC20Implementation = await SaleERC20Implementation.deploy();
    await saleERC20Implementation.deployed();

    [owner, raiseAdmin, user1] = await ethers.getSigners();

    const SaleFactory = await ethers.getContractFactory("SaleFactory");
    saleFactory = await SaleFactory.connect(raiseAdmin).deploy(saleERC20Implementation.address, NULL_ADDRESS);
    await saleFactory.deployed();
    projectTokenDecimals = await raiseToken.decimals();

  });

  it("Test erc20 sale creation", async () => {
    const createdSaleTx = await saleFactory.createSale(owner.address, SaleType.ERC20, fakeToken1.address, raiseToken.address, projectTokenDecimals, minimumAmountToFund, false, SERVICE_FEE);
    
    const createdSaleRc = await createdSaleTx.wait();
    const [newSaleAddr, newSaleType] = createdSaleRc.events?.find(x => x.event == "SaleCreated")?.args!;

    const saleERC20 = await ethers.getContractAt("SaleERC20", newSaleAddr);
    expect(await saleERC20.saleOwner()).to.equal(owner.address);

  });

  it("Check that it's impossible to create a valid sale with invalid implementation", async () => {
    await saleFactory.updateSaleContract(SaleType.ERC20, NULL_ADDRESS);
    await expect(saleFactory.createSale(owner.address, SaleType.ERC20, fakeToken1.address, raiseToken.address, projectTokenDecimals, minimumAmountToFund, false, SERVICE_FEE)).to.be.revertedWith("");
  });

  it("Test sale amount correctness", async () => {
    const testAmount = 10;

    for(let i = 0; i < testAmount; i++) {
        const createdSaleTx = await saleFactory.createSale(owner.address, SaleType.ERC20, fakeToken1.address, raiseToken.address, projectTokenDecimals, minimumAmountToFund, false, SERVICE_FEE);
        const createdSaleRc = await createdSaleTx.wait();
        const [newSaleAddr, newSaleType] = createdSaleRc.events?.find(x => x.event == "SaleCreated")?.args!;
        
        const sale = await ethers.getContractAt("SaleERC20", newSaleAddr);
        expect(await sale.saleOwner()).to.equal(owner.address);
        
        const sales = await saleFactory.getSales(SaleType.ERC20, 0, 1000);
        expect(sales.length).to.equal(i+1);
        expect(sales[i]).to.equal(newSaleAddr);
        expect(await saleFactory.isCreatedByFactory(newSaleAddr)).to.be.true;
    }

    expect(await saleFactory.getSalesNum(SaleType.ERC20)).to.equal(testAmount);
    expect(await saleFactory.getTotalSalesNum()).to.equal(testAmount);
  });
  
  it("Test sale pagination", async () => {
    const testAmount = 10;

    for(let i = 0; i < testAmount; i++) {
        await saleFactory.createSale(owner.address, SaleType.ERC20, fakeToken1.address, raiseToken.address, projectTokenDecimals, minimumAmountToFund, false, SERVICE_FEE);
    }

    const sales = await saleFactory.getSales(SaleType.ERC20, 1, 1000);
    
    expect(sales.length).to.equal(testAmount-1);

    const sales1 = await saleFactory.getSales(SaleType.ERC20, testAmount-1, 1000);
    expect(sales1.length).to.equal(1);

    const sales2 = await saleFactory.getSales(SaleType.ERC20, testAmount, 1000);
    expect(sales2.length).to.equal(0);

    await expect(saleFactory.getSales(SaleType.ERC20, testAmount + 1, 1000)).to.be.revertedWith("Offset is greater than sales num");

    const sales3 = await saleFactory.getSales(SaleType.ERC20, 1, 3);
    expect(sales3.length).to.equal(3);

    const sales4 = await saleFactory.getSales(SaleType.ERC20, testAmount-2, 3);
    expect(sales4.length).to.equal(2);

    const sales5 = await saleFactory.getSales(SaleType.ERC20, 0, 0);
    expect(sales5.length).to.equal(0);
  });

  it("Check is created by factory correctness", async () => {
    const createdSaleTx = await saleFactory.createSale(owner.address, SaleType.ERC20, fakeToken1.address, raiseToken.address, projectTokenDecimals, minimumAmountToFund, false, SERVICE_FEE);
    const createdSaleRc = await createdSaleTx.wait();
    const [newSaleAddr, newSaleType] = createdSaleRc.events?.find(x => x.event == "SaleCreated")?.args!;

    expect(await saleFactory.isCreatedByFactory(newSaleAddr)).to.be.true;
    expect(await saleFactory.isCreatedByFactory(saleERC20Implementation.address)).to.be.false;  // Sale implementation is not created by our factory
  });

  it("Test that only owner can create sale", async () => {
    await expect(saleFactory.connect(user1).createSale(user1.address, SaleType.ERC20, fakeToken1.address, raiseAdmin.address, 18, 0, false, 10)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Test that only owner can update sale contract", async () => {
    await expect(saleFactory.connect(user1).updateSaleContract(SaleType.ERC20, NULL_ADDRESS)).to.be.revertedWith("Ownable: caller is not the owner");
  });
});