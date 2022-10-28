import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers/lib/ethers";
import { keccak256, parseEther, parseUnits, solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import MerkleTree from "merkletreejs";
import {
  FakeToken1,
  FakeTokenUSDC,
  RaiseToken,
  SaleERC20,
  SaleFactory,
  Staking,
} from "../typechain";

enum Tier {
  None = 0,
  Fan = 1,
  Merchant = 2,
  Dealer = 3,
  Broker = 4,
  Tycoon = 5,
}

enum StakingTime {
  Month = 0,
  ThreeMonths = 1,
  SixMonths = 2,
  Year = 3,
}

enum SaleType {
  ERC20 = 0,
  ERC1155 = 1,
}

let raiseToken: RaiseToken;
let fakeToken1: FakeToken1;
let USDC: FakeTokenUSDC;

let staking: Staking;
let saleFactory: SaleFactory;
let saleERC20: SaleERC20;
let saleERC20USDC: SaleERC20;

let saleERC20WithdrawVesting: SaleERC20;

let owner: SignerWithAddress;
let raiseAdmin: SignerWithAddress;
let userNone: SignerWithAddress;
let userFan: SignerWithAddress;
let userMerchant: SignerWithAddress;
let userDealer: SignerWithAddress;
let userBroker: SignerWithAddress;
let userTycoon: SignerWithAddress;
let userTycoon2: SignerWithAddress;
let userTycoonWithAllocBonus: SignerWithAddress;
let projectTokenDecimals: number;
let oneProjectToken: BigNumber;
const raisePerBlock = parseEther("5.0");
const projectTokenBalance = parseEther("5000");
const testAmountToStake = parseEther("333");
const testTimeOfStaking = StakingTime.Month;
const testTier = Tier.Tycoon;
const testMaxAllocation = parseEther("1000");
const testMaxAllocationPerUser = parseEther("200");
const testPeriodSeconds = 60 * 60;
const testTokenPrice = parseEther("10");
const firstRoundId = 0;
const secondRoundId = 1;

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const EMPTY_PROOF = "0x0000000000000000000000000000000000000000000000000000000000000000";
const serviceFee = 10;
const minimumAmountToFund = projectTokenBalance;

describe("Sale ERC20", function () {
  this.beforeEach(async () => {
    const RaiseToken = await ethers.getContractFactory("RaiseToken");
    raiseToken = await RaiseToken.deploy();

    const FakeToken1 = await ethers.getContractFactory("FakeToken1");
    fakeToken1 = await FakeToken1.deploy();

    const UDSCFactory = await ethers.getContractFactory("FakeTokenUSDC");
    USDC = await UDSCFactory.deploy()

    const Staking = await ethers.getContractFactory("Staking");
    staking = await Staking.deploy(raiseToken.address, raisePerBlock);
    await staking.deployed();

    await raiseToken.approve(staking.address, projectTokenBalance);
    await staking.fund(projectTokenBalance);

    const SaleERC20Implementation = await ethers.getContractFactory(
      "SaleERC20"
    );
    const saleERC20Implementation = await SaleERC20Implementation.deploy();

    [
      owner,
      raiseAdmin,
      userNone,
      userFan,
      userMerchant,
      userDealer,
      userBroker,
      userTycoon,
      userTycoon2,
      userTycoonWithAllocBonus,
    ] = await ethers.getSigners();

    const SaleFactory = await ethers.getContractFactory("SaleFactory");
    saleFactory = await SaleFactory.connect(raiseAdmin).deploy(
      saleERC20Implementation.address,
      NULL_ADDRESS
    );
    await saleFactory.deployed();

    projectTokenDecimals = await raiseToken.decimals();
    oneProjectToken = BigNumber.from(10).pow(projectTokenDecimals);

    const createdSaleAddr = await saleFactory
      .connect(raiseAdmin)
      .createSale(
        owner.address,
        SaleType.ERC20,
        fakeToken1.address,
        raiseToken.address,
        projectTokenDecimals,
        minimumAmountToFund,
        false,
        serviceFee
      );
    const createdSaleAddrTx = await createdSaleAddr.wait();
    const [newSaleAddr, newSaleType] = createdSaleAddrTx.events?.find(
      (x) => x.event == "SaleCreated"
    )?.args!;

    saleERC20 = await ethers.getContractAt("SaleERC20", newSaleAddr);

    const createdSaleWithdrawVestingAddr = await saleFactory
      .connect(raiseAdmin)
      .createSale(
        owner.address,
        SaleType.ERC20,
        fakeToken1.address,
        raiseToken.address,
        projectTokenDecimals,
        minimumAmountToFund,
        true,
        serviceFee
      );

    const createdSaleWithdrawVestingAddrTx = await createdSaleWithdrawVestingAddr.wait();
    const [newSaleWithdrawVestingAddr,] = createdSaleWithdrawVestingAddrTx.events?.find(
      (x) => x.event == "SaleCreated"
    )?.args!;

    saleERC20WithdrawVesting = await ethers.getContractAt(
      "SaleERC20",
      newSaleWithdrawVestingAddr
    );

    const createdUSDTSale = await saleFactory
      .connect(raiseAdmin)
      .createSale(
        owner.address,
        SaleType.ERC20,
        USDC.address,
        raiseToken.address,
        projectTokenDecimals,
        minimumAmountToFund,
        true,
        serviceFee
      );

    const createdSaleUSDCAddrTx = await createdUSDTSale.wait();
    const [createdSaleUSDCAddr,] = createdSaleUSDCAddrTx.events?.find(
      (x) => x.event == "SaleCreated"
    )?.args!;

    saleERC20USDC = await ethers.getContractAt(
      "SaleERC20",
      createdSaleUSDCAddr
    );

    await raiseToken.approve(saleERC20.address, projectTokenBalance);
    await saleERC20.fund(projectTokenBalance);

    await raiseToken.approve(saleERC20WithdrawVesting.address, projectTokenBalance);
    await saleERC20WithdrawVesting.fund(projectTokenBalance);

    await raiseToken.approve(saleERC20USDC.address, projectTokenBalance);
    await saleERC20USDC.fund(projectTokenBalance);

    await raiseToken.mint(userFan.address, parseEther("333"));
    await raiseToken.mint(userMerchant.address, parseEther("500"));
    await raiseToken.mint(userDealer.address, parseEther("5000"));
    await raiseToken.mint(userBroker.address, parseEther("50000"));
    await raiseToken.mint(userTycoon.address, parseEther("1000000"));
    await raiseToken.mint(userTycoon2.address, parseEther("1000001"));
    await raiseToken.mint(
      userTycoonWithAllocBonus.address,
      parseEther("1000001")
    );

    await raiseToken
      .connect(userFan)
      .approve(staking.address, parseEther("333"));
    await raiseToken
      .connect(userMerchant)
      .approve(staking.address, parseEther("500"));
    await raiseToken
      .connect(userDealer)
      .approve(staking.address, parseEther("5000"));
    await raiseToken
      .connect(userBroker)
      .approve(staking.address, parseEther("50000"));
    await raiseToken
      .connect(userTycoon)
      .approve(staking.address, parseEther("1000000"));
    await raiseToken
      .connect(userTycoon2)
      .approve(staking.address, parseEther("1000001"));
    await raiseToken
      .connect(userTycoonWithAllocBonus)
      .approve(staking.address, parseEther("1000001"));

    await staking
      .connect(userFan)
      .stake(0, parseEther("333"), testTimeOfStaking);
    await staking
      .connect(userMerchant)
      .stake(0, parseEther("500"), testTimeOfStaking);
    await staking
      .connect(userDealer)
      .stake(0, parseEther("5000"), testTimeOfStaking);
    await staking
      .connect(userBroker)
      .stake(0, parseEther("50000"), testTimeOfStaking);
    await staking
      .connect(userTycoon)
      .stake(0, parseEther("100000"), testTimeOfStaking);
    await staking
      .connect(userTycoon2)
      .stake(0, parseEther("100001"), testTimeOfStaking);
    await staking
      .connect(userTycoonWithAllocBonus)
      .stake(0, parseEther("100001"), StakingTime.SixMonths);
  });

  it("Check only sale owner can withdraw", async () => {
    await raiseToken.approve(saleERC20.address, testAmountToStake);
    await saleERC20.fund(testAmountToStake);
    await expect(saleERC20.connect(raiseAdmin).withdraw()).to.be.revertedWith(
      "Caller is not the owner"
    );

  })

  it("Test that sale owner can't withdraw until end round ended", async () => {
    await raiseToken.approve(saleERC20.address, testAmountToStake);
    await saleERC20.fund(testAmountToStake);
    await expect(saleERC20.withdraw()).to.be.revertedWith(
      "Not available before sale end"
    );
  });

  it("Test funding and withdrawing", async () => {
    const initialProjectTokenBalance = await raiseToken.balanceOf(owner.address);
    await raiseToken.approve(saleERC20.address, testAmountToStake);
    await saleERC20.fund(testAmountToStake);
    const projectTokenBalanceAfterFunding = await raiseToken.balanceOf(owner.address);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        EMPTY_PROOF
      );

    await ethers.provider.send("evm_increaseTime", [testPeriodSeconds + 1]);
    await ethers.provider.send("evm_mine", []);

    expect(await saleERC20.isSaleFinished()).to.be.false;

    await expect(saleERC20.withdraw()).to.be.revertedWith(
      "Not available before sale end"
    );

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        true,
        EMPTY_PROOF
      );

    expect(await saleERC20.isSaleFinished()).to.be.false;

    await expect(saleERC20.withdraw()).to.be.revertedWith(
      "Not available before sale end"
    );

    await ethers.provider.send("evm_increaseTime", [testPeriodSeconds * 0.8]);
    await ethers.provider.send("evm_mine", []);

    expect(await saleERC20.isSaleFinished()).to.be.false;

    await expect(saleERC20.withdraw()).to.be.revertedWith(
      "Not available before sale end"
    );

    await ethers.provider.send("evm_increaseTime", [
      testPeriodSeconds * 0.2 + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    expect(await saleERC20.isSaleFinished()).to.be.true;

    const tokensNotSold = (await saleERC20.projectTokenBalance()).sub(await saleERC20.totalProjectTokenSold());

    expect(tokensNotSold).to.equal(await saleERC20.projectTokenBalance());

    await saleERC20.withdraw();

    const projectTokenBalanceAfterWithdraw = await raiseToken.balanceOf(owner.address);

    expect(
      initialProjectTokenBalance .sub(testAmountToStake).eq(projectTokenBalanceAfterFunding)
    ).to.be.true;
    expect(
      projectTokenBalanceAfterFunding
        .add(tokensNotSold)
        .eq(projectTokenBalanceAfterWithdraw)
    ).to.be.true;
  });

  it("Test that user can't create round if service is not funded", async () => {
    const createdSaleAddr = await saleFactory
      .connect(raiseAdmin)
      .createSale(
        owner.address,
        SaleType.ERC20,
        fakeToken1.address,
        raiseToken.address,
        await raiseToken.decimals(),
        minimumAmountToFund,
        false,
        serviceFee
      );
    const createdSaleAddrTx = await createdSaleAddr.wait();
    const [newSaleAddr, newSaleType] = createdSaleAddrTx.events?.find(
      (x) => x.event == "SaleCreated"
    )?.args!;

    const emptySaleERC20 = await ethers.getContractAt("SaleERC20", newSaleAddr);

    await expect(
      emptySaleERC20
        .connect(raiseAdmin)
        .createRound(
          testTier,
          testMaxAllocation,
          testMaxAllocationPerUser,
          testPeriodSeconds,
          testTokenPrice,
          true,
          EMPTY_PROOF
        )
    ).to.be.revertedWith("Sale is not funded");
  });

  it("Test round creation", async () => {
    const roundCreationTx = await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        EMPTY_PROOF
      );

    const roundCreationRc = await roundCreationTx.wait();
    const roundCreatedEvent = roundCreationRc.events?.find(
      (x) => x.event == "RoundStarted"
    );
    const [roundId, requiredTier, deadline] = roundCreatedEvent?.args!;

    const block = await ethers.provider.getBlock(
      await ethers.provider.getBlockNumber()
    );

    expect(roundId).to.equal(firstRoundId);
    expect(requiredTier).to.equal(testTier);
    expect(
      deadline
        .sub(block.timestamp + testPeriodSeconds)
        .abs()
        .lte(100)
    ).to.be.true;
  });

  it("Check that admin can't create round if there an active one", async () => {
    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        EMPTY_PROOF
      );
    await expect(
      saleERC20
        .connect(raiseAdmin)
        .createRound(
          testTier,
          testMaxAllocation,
          testMaxAllocationPerUser,
          testPeriodSeconds,
          testTokenPrice,
          false,
          EMPTY_PROOF
        )
    ).to.be.revertedWith("First stop ongoing round");
  });

  it("Check that admin create a new round if stopped current one", async () => {
    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        EMPTY_PROOF
      );

    await expect(saleERC20.stopRound(firstRoundId)).to.be.revertedWith("Caller is not the raise admin");

    await saleERC20.connect(raiseAdmin).stopRound(firstRoundId);
    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        EMPTY_PROOF
      );
  });

  it("Check that regular user or sale owner can't create round", async () => {
    await expect(
      saleERC20
        .connect(userTycoon)
        .createRound(
          testTier,
          testMaxAllocation,
          testMaxAllocationPerUser,
          testPeriodSeconds,
          testTokenPrice,
          false,
          EMPTY_PROOF
        )
    ).to.be.revertedWith("Caller is not the raise admin");
    await expect(
      saleERC20.createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        EMPTY_PROOF
      )
    ).to.be.revertedWith("Caller is not the raise admin");
  });

  it("Test that not whitelisted users can't participate event", async () => {

    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );


    expect(await saleERC20.canParticipate(userBroker.address, 0, proof)).be.false;

    const testAmountToPay = testMaxAllocationPerUser.mul(testTokenPrice).div(oneProjectToken);

    await expect(
      saleERC20.connect(userBroker).buy(testAmountToPay, 0, proof)
    ).to.be.revertedWith("User can't participate");
  });


  it("Test that user can't buy more than user allocation", async () => {

    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);


    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    expect(await saleERC20.canParticipate(userTycoon.address, 0, proof)).be.true;

    await expect(
      saleERC20.connect(userTycoon).buy(testMaxAllocationPerUser.mul(testTokenPrice).div(oneProjectToken), 0, proof)
    ).to.be.revertedWith("ERC20: insufficient allowance");

    await expect(
      saleERC20.connect(userTycoon).buy(testMaxAllocationPerUser.mul(testTokenPrice.add(1)).div(oneProjectToken), 0, proof)
    ).to.be.revertedWith("Allocation per user exceeded");

  });

  // testMaxAllocationPerUser = 100 raise tokens
  // testTokenPrice = 10 USDT
  it("Test buying", async () => {
    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const initialTotalPayTokenCollected = await saleERC20.totalPayTokenCollected();
    const initialProjectTokenBalance = await saleERC20.projectTokenBalance();

    const testAmountToPay = testMaxAllocationPerUser.mul(testTokenPrice).div(oneProjectToken);

    fakeToken1.transfer(userTycoon.address, testAmountToPay);
    fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);
    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    const initialUserBalanceInPayTokens = await fakeToken1.balanceOf(
      userTycoon.address
    );

    const buyTx = await saleERC20.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);
    const buyRc = await buyTx.wait();
    const boughtEvent = buyRc.events!.find((x) => x.event == "Bought");
    const [userBought, projectTokenAmount] = boughtEvent?.args!;
    expect(userBought).to.equal(userTycoon.address);
    expect(projectTokenAmount).to.equal(testMaxAllocationPerUser);

    const userBalanceInPayTokensAfterBuy = await fakeToken1.balanceOf(
      userTycoon.address
    );
    expect(
      initialUserBalanceInPayTokens.sub(userBalanceInPayTokensAfterBuy)
    ).to.equal(testAmountToPay);

    expect(saleERC20.projectTokenBalance());

    const finalTotalProjectTokenSold = await saleERC20.totalProjectTokenSold();
    const finalTotalPayTokenCollected =
      await saleERC20.totalPayTokenCollected();
    const finalProjectTokenBalance = await saleERC20.projectTokenBalance();

    expect(finalProjectTokenBalance).to.equal(initialProjectTokenBalance);
    expect(finalTotalProjectTokenSold).to.equal(testMaxAllocationPerUser);
    expect(finalTotalPayTokenCollected).to.equal(initialTotalPayTokenCollected.add(testAmountToPay));

    //const [roundId, deadline, requiredTier, tokenPrice, maxAllocation, maxAllocationPerUser] = await saleERC20.getOngoingRoundInfo();
    const round = await saleERC20.getOngoingRound();
    expect(await saleERC20.totalPayTokenCollected()).to.equal(testAmountToPay);
    expect(await saleERC20.totalRaised()).to.equal(testAmountToPay);
    expect(await saleERC20.totalPayTokenWithdrawn()).to.equal(0);
  });

  it("Test project token withdrawing", async () => {
    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = testMaxAllocationPerUser.div(testTokenPrice);

    fakeToken1.transfer(userTycoon.address, testAmountToPay);
    fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        true,
        rootHash
      );

    await saleERC20.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);

    const projectTokenBalanceBeforeWithdraw = await saleERC20.projectTokenBalance();

    const tokensNotSold = (projectTokenBalanceBeforeWithdraw).sub(await saleERC20.totalProjectTokenSold());

    expect(tokensNotSold.eq(projectTokenBalanceBeforeWithdraw)).to.be.false;

    const initialOwnerBalance = await raiseToken.balanceOf(owner.address);

    await ethers.provider.send("evm_increaseTime", [testPeriodSeconds]);
    await ethers.provider.send("evm_mine", []);

    await saleERC20.withdraw();

    const ownerBalanceAfterWithdraw = await raiseToken.balanceOf(owner.address);


    expect(
      (ownerBalanceAfterWithdraw) .sub(tokensNotSold).eq(initialOwnerBalance)
    ).to.be.true;

    expect(
      (projectTokenBalanceBeforeWithdraw) .sub(tokensNotSold).eq(await saleERC20.projectTokenBalance())
    ).to.be.true;
  });


  it("Test raised withdrawing", async () => {
    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = testMaxAllocationPerUser.div(testTokenPrice);

    fakeToken1.transfer(userTycoon.address, testAmountToPay);
    fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await saleERC20.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);

    const initialOwnerBalance = await fakeToken1.balanceOf(owner.address);
    await expect(saleERC20.connect(raiseAdmin).withdrawRaisedFunds()).to.be.revertedWith("Caller is not the owner");
    const profitWithdrawTx = await saleERC20.withdrawRaisedFunds();
    const profitWithdrawRc = await profitWithdrawTx.wait();

    const [amount, actualAmount, fee] = profitWithdrawRc.events?.find(
      (x) => x.event == "RaisedFundsWithdrawn"
    )?.args!;
    expect(amount).to.equal(testAmountToPay);
    expect(actualAmount).to.equal(
      testAmountToPay.sub(testAmountToPay.mul(serviceFee).div(100))
    );
    expect(fee).to.equal(testAmountToPay.mul(serviceFee).div(100));

    const finalOwnerBalance = await fakeToken1.balanceOf(owner.address);
    expect(finalOwnerBalance).to.equal(
      initialOwnerBalance.add(
        testAmountToPay.sub(testAmountToPay.mul(serviceFee).div(100))
      )
    );
  });

  it("Test that it's impossible to withdraw twice", async () => {
    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = testMaxAllocationPerUser.div(testTokenPrice);

    fakeToken1.transfer(userTycoon.address, testAmountToPay);
    fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await saleERC20.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);

    await saleERC20.withdrawRaisedFunds();
    await expect(saleERC20.withdrawRaisedFunds()).to.be.revertedWith(
      "Nothing to withdraw"
    );
  });

  it("Test withdrawing from multiple rounds", async () => {
    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = testMaxAllocationPerUser.mul(testTokenPrice).div(oneProjectToken).div(2);

    fakeToken1.transfer(userTycoon.address, testAmountToPay);
    fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    await saleERC20.connect(userTycoon).buy(testAmountToPay.div(2), whitelist[0][1], proof);
    await saleERC20.connect(raiseAdmin).stopRound(firstRoundId);
    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await saleERC20.connect(userTycoon).buy(testAmountToPay.div(2), whitelist[0][1], proof);

    const initialOwnerBalance = await fakeToken1.balanceOf(owner.address);
    await saleERC20.withdrawRaisedFunds();
    const finalOwnerBalance = await fakeToken1.balanceOf(owner.address);
    expect(finalOwnerBalance).to.equal(
      initialOwnerBalance
        .add(testAmountToPay)
        .sub(testAmountToPay.mul(serviceFee).div(100))
    );
    expect(await saleERC20.totalRaised()).to.equal(testAmountToPay);
  });

  it("Test user can't withdraw more than round allocation", async () => {
    const testAmountToPay = testMaxAllocationPerUser.mul(testTokenPrice).div(oneProjectToken);

    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');

    fakeToken1.transfer(userTycoon.address, testAmountToPay);
    fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);
    fakeToken1.transfer(userTycoon2.address, testAmountToPay);
    fakeToken1.connect(userTycoon2).approve(saleERC20.address, testAmountToPay);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocationPerUser.mul(3).div(2),
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    await saleERC20.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], merkleTree.getHexProof(leaves[0]));
    await expect(
      saleERC20.connect(userTycoon2).buy(testAmountToPay, whitelist[1][1], merkleTree.getHexProof(leaves[1]))
    ).to.be.revertedWith("Round allocation exceeded");
  });

  it("Test user can buy tokens regarding his allocation bonus", async () => {  // FIX
    let whitelist = [[userTycoonWithAllocBonus.address, 20]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');

    const [userTickets, tier, stake, deadline, allocationBonusPercent] =
      await staking.getUserInfo(userTycoonWithAllocBonus.address);

    expect(allocationBonusPercent).gt(0);

    const testAmountToPay = testMaxAllocationPerUser
      .mul(100 + allocationBonusPercent)
      .div(100)
      .mul(testTokenPrice).div(oneProjectToken);

    fakeToken1.transfer(userTycoonWithAllocBonus.address, testAmountToPay);
    fakeToken1
      .connect(userTycoonWithAllocBonus)
      .approve(saleERC20.address, testAmountToPay);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    await saleERC20.connect(userTycoonWithAllocBonus).buy(testAmountToPay, whitelist[0][1], merkleTree.getHexProof(leaves[0]));
  });

  it("Test user can't buy more tokens then he can regarding the allocation bonus", async () => {
    let whitelist = [[userTycoonWithAllocBonus.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const [userTickets, tier, stake, deadline, allocationBonusPercent] =
      await staking.getUserInfo(userTycoonWithAllocBonus.address);

    expect(allocationBonusPercent).gt(0);

    const testAmountToPay = testMaxAllocationPerUser
      .mul(100 + allocationBonusPercent)
      .div(100)
      .mul(testTokenPrice)
      .div(oneProjectToken)
      .add(1);

    fakeToken1.transfer(userTycoonWithAllocBonus.address, testAmountToPay);
    fakeToken1
      .connect(userTycoonWithAllocBonus)
      .approve(saleERC20.address, testAmountToPay);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    await expect(
      saleERC20.connect(userTycoonWithAllocBonus).buy(testAmountToPay, whitelist[0][1], proof)
    ).to.be.revertedWith("Allocation per user exceeded");
  });

  it("Test ownership transferring", async () => {
    await saleERC20.transferSaleOwnership(userTycoon.address);
    expect(await saleERC20.saleOwner()).to.equal(userTycoon.address);
    await expect(
      saleERC20.transferSaleOwnership(userFan.address)
    ).to.be.revertedWith("Caller is not the owner");
    await saleERC20.connect(userTycoon).transferSaleOwnership(userFan.address);
    expect(await saleERC20.saleOwner()).to.equal(userFan.address);
    await expect(
      saleERC20
        .connect(userFan)
        .transferSaleOwnership("0x0000000000000000000000000000000000000000")
    ).to.be.revertedWith("'New owner is null address");
  });

  // it("Test user can't claim if service has zero balance", async () => {
  //     const testAmountToPay = parseEther("0.01");

  //     fakeToken1.transfer(userTycoon.address, testAmountToPay);
  //     fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);

  //     await saleERC20.withdraw(projectTokenBalance);

  //     await saleERC20.connect(raiseAdmin).createRound(testTier, testMaxAllocation, testMaxAllocationPerUser, testPeriodSeconds, testTokenPrice, false, [userTycoon.address], [0]);
  //     await saleERC20.connect(userTycoon).buy(testAmountToPay);

  //     await expect(saleERC20.connect(userTycoon).claim()).to.be.revertedWith("Not enough service balance");
  // });

  it("Test claiming in case round time is default", async () => {
    let whitelist = [[userTycoon.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = parseEther("0.01");

    await expect(saleERC20.claim()).to.be.revertedWith(
      "All the bought tokens claimed"
    );

    fakeToken1.transfer(userTycoon.address, testAmountToPay);
    fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    await saleERC20.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);
    const claimTx = await saleERC20.connect(userTycoon).claim();
    const claimRc = await claimTx.wait();
    const claimedEvent = claimRc.events?.find((x) => x.event == "Claimed")!;
    const [claimedUser, claimedAmount] = claimedEvent.args!;
    expect(claimedUser).to.equal(userTycoon.address);
    expect(claimedAmount).to.equal(testAmountToPay.mul(oneProjectToken).div(testTokenPrice));
  });

  it("Test that double claim is impossible", async () => {
    let whitelist = [[userTycoon.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = parseEther("0.01");

    fakeToken1.transfer(userTycoon.address, testAmountToPay);
    fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    await saleERC20.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);
    await saleERC20.connect(userTycoon).claim();
    await expect(saleERC20.connect(userTycoon).claim()).to.be.revertedWith(
      "All the bought tokens claimed"
    );
  });

  it("Test claiming with custom vesting schedule", async () => {
    let whitelist = [[userTycoon.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = parseEther("0.01");

    fakeToken1.transfer(userTycoon.address, testAmountToPay);
    fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);

    const fortyPercentTimeOffset1 = 60 * 60 * 10;
    const thirtyPercentTimeOffset2 = 60 * 60 * 15;
    const thirtyPercentTimeOffset3 = 60 * 60 * 25;

    const now = Math.round(Date.now() / 1000);

    const testClaimTimes = [
      now + fortyPercentTimeOffset1,
      now + thirtyPercentTimeOffset2,
      now + thirtyPercentTimeOffset3,
    ];

    const testClaimPercents = [
      40, 30, 30
    ]

    await expect(saleERC20
      .setVestingSchedule(
        testClaimTimes,
        testClaimPercents
      )).to.revertedWith("Caller is not the raise admin");


    await saleERC20
      .connect(raiseAdmin)
      .setVestingSchedule(
        testClaimTimes,
        testClaimPercents
      );

    const claimInfo = await saleERC20.getClaimInfo(userTycoon.address);

    claimInfo.claimTimes_.forEach((e, i) => expect(e.eq(testClaimTimes[i])).to.be.true);
    claimInfo.claimTimes_.forEach((e, i) => expect(e).to.equal(testClaimTimes[i]));
    expect(claimInfo.amountToClaim).to.equal(0);
    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    await saleERC20.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);

    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.eq(0)).to.be.true;

    await expect(saleERC20.connect(userTycoon).claim()).to.be.revertedWith(
      "Nothing to claim now"
    );
    await ethers.provider.send("evm_increaseTime", [fortyPercentTimeOffset1]);
    await ethers.provider.send("evm_mine", []);

    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.gt(0)).to.be.true;

    const claimTx = await saleERC20.connect(userTycoon).claim();
    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.eq(0)).to.be.true;

    const claimRc = await claimTx.wait();
    const claimedEvent = claimRc.events?.find((x) => x.event == "Claimed")!;
    const [claimedUser, claimedAmount] = claimedEvent.args!;
    expect(claimedUser).to.equal(userTycoon.address);
    expect(claimedAmount).to.equal(
      testAmountToPay.mul(oneProjectToken).div(testTokenPrice).mul(40).div(100)
    );

    await ethers.provider.send("evm_increaseTime", [
      thirtyPercentTimeOffset2 - fortyPercentTimeOffset1,
    ]);
    await ethers.provider.send("evm_mine", []);
    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.gt(0)).to.be.true;
    const claimTx1 = await saleERC20.connect(userTycoon).claim();
    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.eq(0)).to.be.true;

    const claimRc1 = await claimTx1.wait();
    const claimedEvent1 = claimRc1.events?.find((x) => x.event == "Claimed")!;
    const [, claimedAmount1] = claimedEvent1.args!;
    expect(claimedAmount1).to.equal(
      testAmountToPay.mul(oneProjectToken).div(testTokenPrice).mul(30).div(100)
    );

    await ethers.provider.send("evm_increaseTime", [
      thirtyPercentTimeOffset3 - thirtyPercentTimeOffset2,
    ]);
    await ethers.provider.send("evm_mine", []);

    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.gt(0)).to.be.true;
    const claimTx2 = await saleERC20.connect(userTycoon).claim();
    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.eq(0)).to.be.true;

    const claimRc2 = await claimTx2.wait();
    const claimedEvent2 = claimRc2.events?.find((x) => x.event == "Claimed")!;
    const [, claimedAmount2] = claimedEvent2.args!;
    expect(claimedAmount2).to.equal(
      testAmountToPay.mul(oneProjectToken).div(testTokenPrice).mul(30).div(100)
    );

    await expect(saleERC20.connect(userTycoon).claim()).to.be.revertedWith(
      "All the bought tokens claimed"
    );
  });

  it("Test claiming with custom vesting schedule shifting", async () => {
    let whitelist = [[userTycoon.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);


    const testAmountToPay = parseEther("0.01");

    fakeToken1.transfer(userTycoon.address, testAmountToPay);
    fakeToken1.connect(userTycoon).approve(saleERC20.address, testAmountToPay);

    const timeshift = 60 * 60 * 24 * 30;

    let fortyPercentTimeOffset1 = 60 * 60 * 10;
    let thirtyPercentTimeOffset2 = 60 * 60 * 15;
    let thirtyPercentTimeOffset3 = 60 * 60 * 25;

    const blockAfter = await ethers.provider.getBlock(
      await ethers.provider.getBlockNumber()
    );
    const now = blockAfter.timestamp;

    await saleERC20
      .connect(raiseAdmin)
      .setVestingSchedule(
        [
          now + fortyPercentTimeOffset1,
          now + thirtyPercentTimeOffset2,
          now + thirtyPercentTimeOffset3,
        ],
        [40, 30, 30]
      );

    await expect(saleERC20.shiftVestingSchedule(timeshift)).to.be.revertedWith("Caller is not the raise admin");

    await saleERC20.connect(raiseAdmin).shiftVestingSchedule(timeshift);

    fortyPercentTimeOffset1 += timeshift;
    thirtyPercentTimeOffset2 += timeshift;
    thirtyPercentTimeOffset3 += timeshift;

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    await saleERC20.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);
    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.eq(0)).to.be.true;
    await expect(saleERC20.connect(userTycoon).claim()).to.be.revertedWith(
      "Nothing to claim now"
    );
    await ethers.provider.send("evm_increaseTime", [fortyPercentTimeOffset1]);
    await ethers.provider.send("evm_mine", []);

    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.gt(0)).to.be.true;

    const claimTx = await saleERC20.connect(userTycoon).claim();
    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.eq(0)).to.be.true;

    const claimRc = await claimTx.wait();
    const claimedEvent = claimRc.events?.find((x) => x.event == "Claimed")!;
    const [claimedUser, claimedAmount] = claimedEvent.args!;
    expect(claimedUser).to.equal(userTycoon.address);
    expect(claimedAmount).to.equal(
      testAmountToPay.mul(oneProjectToken).div(testTokenPrice).mul(40).div(100)
    );

    await ethers.provider.send("evm_increaseTime", [
      thirtyPercentTimeOffset2 - fortyPercentTimeOffset1,
    ]);
    await ethers.provider.send("evm_mine", []);
    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.gt(0)).to.be.true;
    const claimTx1 = await saleERC20.connect(userTycoon).claim();
    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.eq(0)).to.be.true;

    const claimRc1 = await claimTx1.wait();
    const claimedEvent1 = claimRc1.events?.find((x) => x.event == "Claimed")!;
    const [, claimedAmount1] = claimedEvent1.args!;
    expect(claimedAmount1).to.equal(
      testAmountToPay.mul(oneProjectToken).div(testTokenPrice).mul(30).div(100)
    );

    await ethers.provider.send("evm_increaseTime", [
      thirtyPercentTimeOffset3 - thirtyPercentTimeOffset2,
    ]);
    await ethers.provider.send("evm_mine", []);

    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.gt(0)).to.be.true;
    const claimTx2 = await saleERC20.connect(userTycoon).claim();
    expect((await saleERC20.getClaimInfo(userTycoon.address)).amountToClaim.eq(0)).to.be.true;

    const claimRc2 = await claimTx2.wait();
    const claimedEvent2 = claimRc2.events?.find((x) => x.event == "Claimed")!;
    const [, claimedAmount2] = claimedEvent2.args!;
    expect(claimedAmount2).to.equal(
      testAmountToPay.mul(oneProjectToken).div(testTokenPrice).mul(30).div(100)
    );

    await expect(saleERC20.connect(userTycoon).claim()).to.be.revertedWith(
      "All the bought tokens claimed"
    );
  });

  it("Test incorrect vesting params", async () => {
    await expect(
      saleERC20.connect(raiseAdmin).setVestingSchedule([100500, 200500], [100])
    ).to.be.revertedWith("Array sizes must be the same");

    await expect(
      saleERC20.connect(raiseAdmin).setVestingSchedule([Date.now()], [80])
    ).to.be.revertedWith("Claim percents sum is not 100");

    await expect(
      saleERC20.connect(raiseAdmin).setVestingSchedule([], [])
    ).to.be.revertedWith("Schedule can not be empty");
  });

  it("Check ongoing round", async () => {
    let whitelist = [[userTycoon.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    await expect(saleERC20.getOngoingRoundInfo()).to.be.revertedWith(
      "No rounds created"
    );

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    await saleERC20.connect(raiseAdmin).stopRound(firstRoundId);
    await expect(saleERC20.getOngoingRoundInfo()).to.be.revertedWith(
      "No active rounds"
    );

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    await ethers.provider.send("evm_increaseTime", [testPeriodSeconds + 10]);
    await ethers.provider.send("evm_mine", []);
    await expect(saleERC20.getOngoingRoundInfo()).to.be.revertedWith(
      "Round ended"
    );

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );
    const [
      id,
      deadline,
      requiredTier,
      tokenPrice,
      maxAllocation,
      maxAllocationPerUser,
    ] = await saleERC20.getOngoingRoundInfo();
    expect(id).to.equal(2);
    expect(requiredTier).to.equal(testTier);
    expect(tokenPrice).to.equal(testTokenPrice);
    expect(maxAllocation).to.equal(testMaxAllocation);
    expect(maxAllocationPerUser).to.equal(testMaxAllocationPerUser);
  });

  it("Test pausing", async () => {
    let whitelist = [[userTycoon.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = testMaxAllocationPerUser.mul(testTokenPrice).div(oneProjectToken).div(2);

    await expect(saleERC20.pause()).to.be.revertedWith("Caller is not the raise admin");

    await saleERC20.connect(raiseAdmin).pause();

    await expect(saleERC20.buy(testAmountToPay, whitelist[0][1], proof)).to.be.revertedWith(
      "Pausable: paused"
    );
    await expect(saleERC20.claim()).to.be.revertedWith("Pausable: paused");
    await expect(saleERC20.unpause()).to.be.revertedWith("Caller is not the raise admin");

    await saleERC20.connect(raiseAdmin).unpause();

    await expect(saleERC20.buy(testAmountToPay, whitelist[0][1], proof)).to.be.revertedWith(
      "No rounds created"
    );
    await expect(saleERC20.claim()).to.be.revertedWith(
      "All the bought tokens claimed"
    );
  });

  it("Test allocation bonus and whitelisting correctness", async () => {
    let whitelist = [
      [owner.address, 40],
      [userNone.address, 20],
      [userFan.address, 100],
      [userMerchant.address, 0],
      [userDealer.address, 127],
      [userBroker.address, 1],
      [userTycoon.address, 99]
    ];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    expect(await saleERC20.canParticipate(owner.address, 40, merkleTree.getHexProof(leaves[0]))).to.be.true;
    expect(await saleERC20.canParticipate(userNone.address, 20, merkleTree.getHexProof(leaves[1]))).to.be.true;
    expect(await saleERC20.canParticipate(userFan.address, 100, merkleTree.getHexProof(leaves[2]))).to.be.true;
    expect(await saleERC20.canParticipate(userMerchant.address, 0, merkleTree.getHexProof(leaves[3]))).to.be.true;
    expect(await saleERC20.canParticipate(userDealer.address, 127, merkleTree.getHexProof(leaves[4]))).to.be.true;
    expect(await saleERC20.canParticipate(userBroker.address, 1, merkleTree.getHexProof(leaves[5]))).to.be.true;
    expect(await saleERC20.canParticipate(userTycoon.address, 99, merkleTree.getHexProof(leaves[6]))).to.be.true;

    expect(await saleERC20.canParticipate(userTycoon2.address, 0, merkleTree.getHexProof(keccak256(solidityPack(["address", "uint8"], [userTycoon2.address, 0]))))).to.be.false;
    expect(await saleERC20.canParticipate(userTycoonWithAllocBonus.address, 0, merkleTree.getHexProof(keccak256(solidityPack(["address", "uint8"], [userTycoonWithAllocBonus.address, 0]))))).to.be.false;

  });

  it("Check raise admin can't withdraw if project is healthy", async () => {
    await expect(saleERC20.emergencyWithdrawRaisedFunds()).to.be.revertedWith(
      "Caller is not the raise admin"
    );
    await expect(
      saleERC20.connect(raiseAdmin).emergencyWithdrawRaisedFunds()
    ).to.be.revertedWith("Project is healthy");
  });

  it("Check raise admin transferring", async () => {
    await expect(
      saleERC20.connect(userBroker).transferRaiseAdminRole(userBroker.address)
    ).to.be.revertedWith("Caller is not the raise admin");
    await expect(
      saleERC20.connect(raiseAdmin).transferRaiseAdminRole(NULL_ADDRESS)
    ).to.be.revertedWith("New admin is null address");
    expect(
      await saleERC20
        .connect(raiseAdmin)
        .transferRaiseAdminRole(userBroker.address)
    );
    expect(await saleERC20.raiseAdmin()).to.equal(userBroker.address);
  });

  it("Check user can't buy and owner can't withdraw profit if project is unhealthy", async () => {
    const testAmountToPay = testMaxAllocationPerUser.mul(testTokenPrice).div(oneProjectToken).div(2);
    await saleERC20.connect(raiseAdmin).setIsUnhealthy(true);
    await expect(saleERC20.buy(testAmountToPay, 0, [EMPTY_PROOF])).to.be.revertedWith(
      "Project is unhealthy"
    );
    await expect(saleERC20.withdrawRaisedFunds()).to.be.revertedWith(
      "Project is unhealthy"
    );
    await saleERC20WithdrawVesting.connect(raiseAdmin).setIsUnhealthy(false);
  });

  it("Check admin can't set or shit withdraw vesting if it's not enabled", async () => {
    await expect(
      saleERC20.setWithdrawScheduleForSaleOwner([], [])
    ).to.be.revertedWith("Caller is not the raise admin");

    await expect(
      saleERC20.connect(raiseAdmin).setWithdrawScheduleForSaleOwner([], [])
    ).to.be.revertedWith("Withdraw vesting is not enabled");

    await expect(
      saleERC20.connect(raiseAdmin).shiftSaleOwnerWithdrawSchedule(0)
    ).to.be.revertedWith("Withdraw vesting is not enabled");

    await expect(saleERC20.shiftSaleOwnerWithdrawSchedule(0)).to.be.revertedWith("Caller is not the raise admin");

  });

  it("Test withdrawing with withdraw schedule", async () => {
    let whitelist = [[userTycoon.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = parseEther("0.01");

    fakeToken1.transfer(userTycoon.address, testAmountToPay.mul(10));
    fakeToken1
      .connect(userTycoon)
      .approve(saleERC20WithdrawVesting.address, testAmountToPay.mul(10));

    const fortyPercentTimeOffset1 = 60 * 60 * 10;
    const thirtyPercentTimeOffset2 = 60 * 60 * 15;
    const thirtyPercentTimeOffset3 = 60 * 60 * 25;

    const now = (
      await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
    ).timestamp;

    await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .setWithdrawScheduleForSaleOwner(
        [
          now + fortyPercentTimeOffset1,
          now + thirtyPercentTimeOffset2,
          now + thirtyPercentTimeOffset3,
        ],
        [40, 30, 30]
      );
    await saleERC20WithdrawVesting.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);
    await expect(saleERC20WithdrawVesting.withdrawRaisedFunds()).to.be.revertedWith(
      "Nothing to withdraw now"
    );

    await ethers.provider.send("evm_increaseTime", [fortyPercentTimeOffset1]);
    await ethers.provider.send("evm_mine", []);

    const initialOwnerPayTokenBalance = await fakeToken1.balanceOf(
      owner.address
    );
    const withdrawTx = await saleERC20WithdrawVesting.withdrawRaisedFunds(); // 40% expected to be withdrawes
    const ownerPayTokenBalanceAfterWithdraw = await fakeToken1.balanceOf(
      owner.address
    );
    const rewardAfterFee1 = testAmountToPay
      .mul(40)
      .div(100)
      .sub(testAmountToPay.mul(40).div(100).mul(serviceFee).div(100));
    expect(
      ownerPayTokenBalanceAfterWithdraw
        .sub(initialOwnerPayTokenBalance)
        .eq(rewardAfterFee1)
    ).to.be.true; // Withdrawn 40%
    const withdrawRc = await withdrawTx.wait();
    expect(
      withdrawRc.events!.find((x) => x.event == "RaisedFundsWithdrawn")!.args![0]
    ).equal(testAmountToPay.mul(40).div(100));
    expect(
      withdrawRc.events!.find((x) => x.event == "RaisedFundsWithdrawn")!.args![1]
    ).equal(rewardAfterFee1);
    expect(
      withdrawRc.events!.find((x) => x.event == "RaisedFundsWithdrawn")!.args![2]
    ).equal(testAmountToPay.mul(40).div(100).mul(serviceFee).div(100));

    await ethers.provider.send("evm_increaseTime", [
      thirtyPercentTimeOffset2 - fortyPercentTimeOffset1,
    ]);
    await ethers.provider.send("evm_mine", []);

    const initialOwnerPayTokenBalance1 = await fakeToken1.balanceOf(
      owner.address
    );
    const withdrawTx1 = await saleERC20WithdrawVesting.withdrawRaisedFunds(); // 30% expected to be withdrawes
    const ownerPayTokenBalanceAfterWithdraw1 = await fakeToken1.balanceOf(
      owner.address
    );
    const rewardAfterFee2 = testAmountToPay
      .mul(30)
      .div(100)
      .sub(testAmountToPay.mul(30).div(100).mul(serviceFee).div(100));

    expect(
      ownerPayTokenBalanceAfterWithdraw1
        .sub(initialOwnerPayTokenBalance1)
        .eq(rewardAfterFee2)
    ).to.be.true; // Withdrawn next 30%
    const withdrawRc1 = await withdrawTx1.wait();
    expect(
      withdrawRc1.events!.find((x) => x.event == "RaisedFundsWithdrawn")!.args![0]
    ).equal(testAmountToPay.mul(30).div(100));
    expect(
      withdrawRc1.events!.find((x) => x.event == "RaisedFundsWithdrawn")!.args![1]
    ).equal(rewardAfterFee2);
    expect(
      withdrawRc1.events!.find((x) => x.event == "RaisedFundsWithdrawn")!.args![2]
    ).equal(testAmountToPay.mul(30).div(100).mul(serviceFee).div(100));

    await ethers.provider.send("evm_increaseTime", [
      thirtyPercentTimeOffset3 - thirtyPercentTimeOffset2,
    ]);
    await ethers.provider.send("evm_mine", []);

    const initialOwnerPayTokenBalance2 = await fakeToken1.balanceOf(
      owner.address
    );
    const withdrawTx2 = await saleERC20WithdrawVesting.withdrawRaisedFunds(); // 30% expected to be withdrawes
    const ownerPayTokenBalanceAfterWithdraw2 = await fakeToken1.balanceOf(
      owner.address
    );
    expect(
      ownerPayTokenBalanceAfterWithdraw2
        .sub(initialOwnerPayTokenBalance2)
        .eq(rewardAfterFee2)
    ).to.be.true; // Withdrawn next 30%
    const withdrawRc2 = await withdrawTx2.wait();
    expect(
      withdrawRc2.events!.find((x) => x.event == "RaisedFundsWithdrawn")!.args![0]
    ).equal(testAmountToPay.mul(30).div(100));
  });

  it("Test withdrawing with shifted withdraw schedule", async () => {
    let whitelist = [[userTycoon.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = parseEther("0.01");

    fakeToken1.transfer(userTycoon.address, testAmountToPay.mul(10));
    fakeToken1
      .connect(userTycoon)
      .approve(saleERC20WithdrawVesting.address, testAmountToPay.mul(10));

    const timeshift = 60 * 60 * 24 * 30;

    let fortyPercentTimeOffset1 = 60 * 60 * 10;
    let thirtyPercentTimeOffset2 = 60 * 60 * 15;
    let thirtyPercentTimeOffset3 = 60 * 60 * 25;

    const now = (
      await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
    ).timestamp;

    await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .setWithdrawScheduleForSaleOwner(
        [
          now + fortyPercentTimeOffset1,
          now + thirtyPercentTimeOffset2,
          now + thirtyPercentTimeOffset3,
        ],
        [40, 30, 30]
      );

    await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .shiftSaleOwnerWithdrawSchedule(timeshift);

    fortyPercentTimeOffset1 += timeshift;
    thirtyPercentTimeOffset2 += timeshift;
    thirtyPercentTimeOffset3 += timeshift;

    await saleERC20WithdrawVesting.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);
    await expect(saleERC20WithdrawVesting.withdrawRaisedFunds()).to.be.revertedWith(
      "Nothing to withdraw now"
    );

    await ethers.provider.send("evm_increaseTime", [fortyPercentTimeOffset1]);
    await ethers.provider.send("evm_mine", []);

    const withdrawTx = await saleERC20WithdrawVesting.withdrawRaisedFunds(); // 40% expected to be withdrawes
    const withdrawRc = await withdrawTx.wait();
    expect(
      withdrawRc.events!.find((x) => x.event == "RaisedFundsWithdrawn")!.args![0]
    ).equal(testAmountToPay.mul(40).div(100));

    await ethers.provider.send("evm_increaseTime", [
      thirtyPercentTimeOffset2 - fortyPercentTimeOffset1,
    ]);
    await ethers.provider.send("evm_mine", []);

    const withdrawTx1 = await saleERC20WithdrawVesting.withdrawRaisedFunds(); // 30% expected to be withdrawes
    const withdrawRc1 = await withdrawTx1.wait();
    expect(
      withdrawRc1.events!.find((x) => x.event == "RaisedFundsWithdrawn")!.args![0]
    ).equal(testAmountToPay.mul(30).div(100));

    await ethers.provider.send("evm_increaseTime", [
      thirtyPercentTimeOffset3 - thirtyPercentTimeOffset2,
    ]);
    await ethers.provider.send("evm_mine", []);

    const withdrawTx2 = await saleERC20WithdrawVesting.withdrawRaisedFunds(); // 30% expected to be withdrawes
    const withdrawRc2 = await withdrawTx2.wait();
    expect(
      withdrawRc2.events!.find((x) => x.event == "RaisedFundsWithdrawn")!.args![0]
    ).equal(testAmountToPay.mul(30).div(100));
  });

  it("Test emergency profit withdrawing by admin", async () => {
    let whitelist = [[userTycoon.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = parseEther("0.01");

    fakeToken1.transfer(userTycoon.address, testAmountToPay.mul(10));
    fakeToken1
      .connect(userTycoon)
      .approve(saleERC20WithdrawVesting.address, testAmountToPay.mul(10));

    const fortyPercentTimeOffset1 = 60 * 60 * 10;
    const thirtyPercentTimeOffset2 = 60 * 60 * 15;
    const thirtyPercentTimeOffset3 = 60 * 60 * 25;

    const now = (
      await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
    ).timestamp;

    await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .setWithdrawScheduleForSaleOwner(
        [
          now + fortyPercentTimeOffset1,
          now + thirtyPercentTimeOffset2,
          now + thirtyPercentTimeOffset3,
        ],
        [40, 30, 30]
      );
    await saleERC20WithdrawVesting.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);
    await expect(saleERC20WithdrawVesting.withdrawRaisedFunds()).to.be.revertedWith(
      "Nothing to withdraw now"
    );
    await expect(
      saleERC20WithdrawVesting.emergencyWithdrawRaisedFunds()
    ).to.be.revertedWith("Caller is not the raise admin");
    await expect(
      saleERC20WithdrawVesting.connect(raiseAdmin).emergencyWithdrawRaisedFunds()
    ).to.be.revertedWith("Project is healthy");
    await expect(
      saleERC20WithdrawVesting.setIsUnhealthy(true)
    ).to.be.revertedWith("Caller is not the raise admin");
    await saleERC20WithdrawVesting.connect(raiseAdmin).setIsUnhealthy(true);
    await expect(saleERC20WithdrawVesting.withdrawRaisedFunds()).to.be.revertedWith(
      "Project is unhealthy"
    );
    const initialRaiseAdminPayTokenBalance = await fakeToken1.balanceOf(
      raiseAdmin.address
    );
    const emergencyUnstakeTx = await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .emergencyWithdrawRaisedFunds();
    const finalRaiseAdminPayTokenBalance = await fakeToken1.balanceOf(
      raiseAdmin.address
    );
    expect(
      finalRaiseAdminPayTokenBalance
        .sub(initialRaiseAdminPayTokenBalance)
        .eq(testAmountToPay)
    ).to.be.true;

    const emergencyUnstakeRc = await emergencyUnstakeTx.wait();
    expect(
      emergencyUnstakeRc.events?.find(
        (x) => x.event == "RaisedFundsWithdrawnEmergency"
      )?.args![0]
    ).to.equal(testAmountToPay);
    await expect(
      saleERC20WithdrawVesting.connect(raiseAdmin).emergencyWithdrawRaisedFunds()
    ).to.be.revertedWith("Nothing to withdraw");
  });

  it("Test incorrect withdraw vesting params", async () => {
    await expect(
      saleERC20WithdrawVesting
        .connect(raiseAdmin)
        .setWithdrawScheduleForSaleOwner([100500, 200500], [100])
    ).to.be.revertedWith("Array sizes must be the same");

    await expect(
      saleERC20WithdrawVesting
        .connect(raiseAdmin)
        .setWithdrawScheduleForSaleOwner([Date.now()], [80])
    ).to.be.revertedWith("Withdraw percents sum is not 100");

    await expect(
      saleERC20WithdrawVesting
        .connect(raiseAdmin)
        .setWithdrawScheduleForSaleOwner([], [])
    ).to.be.revertedWith("Schedule can not be empty");

  });

  it("Test refunding", async () => {
    let whitelist = [[userTycoon.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testAmountToPay = parseEther("0.01");

    fakeToken1.transfer(userTycoon.address, testAmountToPay.mul(10));
    fakeToken1
      .connect(userTycoon)
      .approve(saleERC20WithdrawVesting.address, testAmountToPay.mul(10));

    await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await saleERC20WithdrawVesting.connect(userTycoon).buy(testAmountToPay, whitelist[0][1], proof);

    await expect(saleERC20WithdrawVesting
      .connect(userTycoon)
      .refund()).to.be.revertedWith("Project is healthy")
    await saleERC20WithdrawVesting.connect(raiseAdmin).setIsUnhealthy(true);
    await expect(saleERC20WithdrawVesting.withdrawRaisedFunds()).to.be.revertedWith(
      "Project is unhealthy"
    );
    const initialRaiseAdminPayTokenBalance = await fakeToken1.balanceOf(
      userTycoon.address
    );
    const refundTx = await saleERC20WithdrawVesting
      .connect(userTycoon)
      .refund();
    const finalRaiseAdminPayTokenBalance = await fakeToken1.balanceOf(
      userTycoon.address
    );
    expect(
      finalRaiseAdminPayTokenBalance
        .sub(initialRaiseAdminPayTokenBalance)
        .eq(testAmountToPay)
    ).to.be.true;

    const refundRc = await refundTx.wait();
    expect(
      refundRc.events?.find((x) => x.event == "Refunded")?.args![1]
    ).to.equal(testAmountToPay);
    await expect(
      saleERC20WithdrawVesting.connect(userTycoon).refund()
    ).to.be.revertedWith("Nothing to refund");
  });

  it("Test refunding case if first user donated 2/3, second 1/3. Owner withdrawn 1/2", async () => {
    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');

    const testAmountToPay1 = parseEther("2.0");
    const testAmountToPay2 = parseEther("1.0");
    const totalDonated = testAmountToPay1.add(testAmountToPay2);
    const now = (
      await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
    ).timestamp;

    fakeToken1.transfer(userTycoon.address, testAmountToPay1);
    fakeToken1
      .connect(userTycoon)
      .approve(saleERC20WithdrawVesting.address, testAmountToPay1);

    fakeToken1.transfer(userTycoon2.address, testAmountToPay2);
    fakeToken1
      .connect(userTycoon2)
      .approve(saleERC20WithdrawVesting.address, testAmountToPay2);

    await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .setWithdrawScheduleForSaleOwner([now, now + 60 * 60], ["50", "50"]);

    await saleERC20WithdrawVesting
      .connect(raiseAdmin)
      .createRound(
        testTier,
        totalDonated.mul(testTokenPrice),
        testAmountToPay1.mul(testTokenPrice),
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await saleERC20WithdrawVesting.connect(userTycoon).buy(testAmountToPay1, whitelist[0][1], merkleTree.getHexProof(leaves[0]));
    await saleERC20WithdrawVesting.connect(userTycoon2).buy(testAmountToPay2, whitelist[1][1], merkleTree.getHexProof(leaves[1]));

    await saleERC20WithdrawVesting.withdrawRaisedFunds();

    await saleERC20WithdrawVesting.connect(raiseAdmin).setIsUnhealthy(true);

    expect(await saleERC20WithdrawVesting.totalPayTokenWithdrawn()).equal(
      totalDonated.div(2)
    );

    const refundTx = await saleERC20WithdrawVesting
      .connect(userTycoon)
      .refund();
    expect(
      (await refundTx.wait()).events?.find((x) => x.event == "Refunded")
        ?.args![1]
    ).to.equal(testAmountToPay1.div(2));
    expect(await saleERC20WithdrawVesting.totalPayTokenWithdrawn()).equal(
      totalDonated.div(2).add(testAmountToPay1.div(2))
    );

    const refundTx2 = await saleERC20WithdrawVesting
      .connect(userTycoon2)
      .refund();
    expect(
      (await refundTx2.wait()).events?.find((x) => x.event == "Refunded")
        ?.args![1]
    ).to.equal(testAmountToPay2.div(2));
    expect(await saleERC20WithdrawVesting.totalPayTokenWithdrawn()).equal(
      totalDonated
        .div(2)
        .add(testAmountToPay1.div(2))
        .add(testAmountToPay2.div(2))
    );
  });

  it("Test service fee changing", async () => {

    const testServiceFee = 1;

    await expect(saleERC20.setServiceFee(testServiceFee)).to.be.revertedWith("Caller is not the raise admin");

    await saleERC20.connect(raiseAdmin).setServiceFee(testServiceFee);
    expect(await saleERC20.serviceFeePercent()).to.equal(testServiceFee);
  });

  it("Check admin can withdraw tokens project tokens if project is unhealthy", async () => {
    const testAmountToPay = testMaxAllocationPerUser.mul(testTokenPrice).div(oneProjectToken).div(2);
    await expect(
      saleERC20.connect(raiseAdmin).emergencyWithdraw()
    ).to.be.revertedWith("Project is healthy");
    await saleERC20.connect(raiseAdmin).setIsUnhealthy(true);


    const initialRaiseAdminProjectTokenBalance = await raiseToken.balanceOf(
      raiseAdmin.address
    );

    await expect(saleERC20.emergencyWithdraw()).to.be.revertedWith("Caller is not the raise admin");

    await saleERC20.connect(raiseAdmin).emergencyWithdraw();
    expect(await saleERC20.projectTokenBalance()).to.equal(0);
    const finalRaiseAdminProjectTokenBalance = await raiseToken.balanceOf(
      raiseAdmin.address
    );

    expect(
      finalRaiseAdminProjectTokenBalance
        .sub(initialRaiseAdminProjectTokenBalance)
        .eq(projectTokenBalance)
    ).to.be.true;
  });

  it("Test usdc sale with price 100", async () => {
    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testTokenPrice = parseUnits("100", 6);

    const projectTokensToGet = parseEther("2.0")
    const testAmountToPayUSDC = parseUnits("200.0", 6);

    USDC.transfer(userTycoon.address, testAmountToPayUSDC);
    USDC.connect(userTycoon).approve(saleERC20.address, testAmountToPayUSDC);

    await saleERC20USDC
      .connect(raiseAdmin)
      .createRound(
        testTier,
        projectTokensToGet,
        projectTokensToGet,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await USDC.transfer(userTycoon.address, testAmountToPayUSDC);
    await USDC.connect(userTycoon).approve(saleERC20USDC.address, userTycoon.address);

    const initialProjectTokenBalance = await raiseToken.balanceOf(userTycoon.address);
    const initialPayTokenBalance = await USDC.balanceOf(userTycoon.address);

    await saleERC20USDC.connect(userTycoon).buy(testAmountToPayUSDC, whitelist[0][1], proof);

    const claimTx = await saleERC20USDC.connect(userTycoon).claim();
    const claimRc = await claimTx.wait();
    const claimedEvent = claimRc.events?.find((x) => x.event == "Claimed")!;
    const [claimedUser, claimedAmount] = claimedEvent.args!;

    const finalProjectTokenBalance = await raiseToken.balanceOf(userTycoon.address);
    const finalPayTokenBalance = await USDC.balanceOf(userTycoon.address);

    expect(claimedAmount).to.equal(projectTokensToGet);
    expect(finalProjectTokenBalance.sub(initialProjectTokenBalance)).to.equal(projectTokensToGet);
    expect(initialPayTokenBalance.sub(finalPayTokenBalance)).to.equal(testAmountToPayUSDC);
  });

  it("Test usdc sale with price 0.01", async () => {
    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testTokenPrice = parseUnits("0.01", 6);

    const projectTokensToGet = parseEther("300.0")
    const testAmountToPayUSDC = parseUnits("3.0", 6);

    USDC.transfer(userTycoon.address, testAmountToPayUSDC);
    USDC.connect(userTycoon).approve(saleERC20.address, testAmountToPayUSDC);

    await saleERC20USDC
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        projectTokensToGet,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await USDC.transfer(userTycoon.address, testAmountToPayUSDC);
    await USDC.connect(userTycoon).approve(saleERC20USDC.address, userTycoon.address);

    const initialProjectTokenBalance = await raiseToken.balanceOf(userTycoon.address);
    const initialPayTokenBalance = await USDC.balanceOf(userTycoon.address);

    await saleERC20USDC.connect(userTycoon).buy(testAmountToPayUSDC, whitelist[0][1], proof);

    const claimTx = await saleERC20USDC.connect(userTycoon).claim();
    const claimRc = await claimTx.wait();
    const claimedEvent = claimRc.events?.find((x) => x.event == "Claimed")!;
    const [claimedUser, claimedAmount] = claimedEvent.args!;

    const finalProjectTokenBalance = await raiseToken.balanceOf(userTycoon.address);
    const finalPayTokenBalance = await USDC.balanceOf(userTycoon.address);

    expect(claimedAmount).to.equal(projectTokensToGet);
    expect(finalProjectTokenBalance.sub(initialProjectTokenBalance)).to.equal(projectTokensToGet);
    expect(initialPayTokenBalance.sub(finalPayTokenBalance)).to.equal(testAmountToPayUSDC);
  });

  it("Test token price can't be zero", async () => {

    const testTokenPrice = 0;

    await expect(saleERC20USDC
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        EMPTY_PROOF
      )).to.be.revertedWith("Token price can't be zero");
  });

  it("Test user can't buy if sum is too low", async () => {
    let whitelist = [[userTycoon.address, 0], [userTycoon2.address, 0]];
    let leaves = whitelist.map(info => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])))
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true })
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');
    const proof = merkleTree.getHexProof(leaves[0]);

    const testTokenPrice = 1;
    const testAmountToPayUSDC = 0;

    USDC.transfer(userTycoon.address, testAmountToPayUSDC);
    USDC.connect(userTycoon).approve(saleERC20.address, testAmountToPayUSDC);

    await saleERC20USDC
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        rootHash
      );

    await USDC.transfer(userTycoon.address, testAmountToPayUSDC);
    await USDC.connect(userTycoon).approve(saleERC20USDC.address, userTycoon.address);

    await expect(saleERC20USDC.connect(userTycoon).buy(testAmountToPayUSDC, whitelist[0][1], proof)).to.be.revertedWith("Nothing to buy");
  });


  it("Check sale is finished after if final round is stopped", async () => {
    await raiseToken.approve(saleERC20.address, testAmountToStake);
    await saleERC20.fund(testAmountToStake);

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        false,
        EMPTY_PROOF
      );


    await ethers.provider.send("evm_increaseTime", [testPeriodSeconds + 1]);
    await ethers.provider.send("evm_mine", []);

    expect(await saleERC20.isSaleFinished()).to.be.false;

    await saleERC20.connect(raiseAdmin).stopRound(firstRoundId);

    expect(await saleERC20.isSaleFinished()).to.be.false;

    await saleERC20
      .connect(raiseAdmin)
      .createRound(
        testTier,
        testMaxAllocation,
        testMaxAllocationPerUser,
        testPeriodSeconds,
        testTokenPrice,
        true,
        EMPTY_PROOF
      );

    expect(await saleERC20.isSaleFinished()).to.be.false;

    await saleERC20.connect(raiseAdmin).stopRound(secondRoundId);

    expect(await saleERC20.isSaleFinished()).to.be.true;
  });
});
