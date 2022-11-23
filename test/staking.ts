import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FakeToken1, RaiseToken, Staking } from "../typechain";

enum Tier {
  None = 0,
  Fan = 1,
  Merchant = 2,
  Dealer = 3,
  Broker = 4,
  Tycoon = 5
}

enum StakingTime {
  Month = 0,
  ThreeMonths = 1,
  SixMonths = 2,
  Year = 3,
}

let raiseToken: RaiseToken;
let fakeToken1: FakeToken1;

let staking: Staking;

let owner: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let user4: SignerWithAddress;
let user5: SignerWithAddress;
let user6: SignerWithAddress;

const raisePerBlock = parseEther("5.0");
const serviceBalance = parseEther("500000");

const testAmountToStake = parseEther("333");
const testTimeOfStaking = StakingTime.Month;
const EPSILON = parseEther("0.000000001");
const penaltyPercent = 30;
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Staking", function () {
  this.beforeEach(async () => {
    const RaiseToken = await ethers.getContractFactory("RaiseToken");
    raiseToken = await RaiseToken.deploy();

    const FakeToken1 = await ethers.getContractFactory("FakeToken1");
    fakeToken1 = await FakeToken1.deploy();

    const Staking = await ethers.getContractFactory("Staking");
    staking = await Staking.deploy(raiseToken.address, raisePerBlock);
    await staking.deployed();
    
    await raiseToken.approve(staking.address, serviceBalance);
    await staking.fund(serviceBalance);

    [owner, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();
  });

  it("Test platform initialization", async function () {
    const [userTickets, tier, stake, deadline, allocationBonusPercent] = await staking.getUserInfo(owner.address);
    expect(tier).to.equal(Tier.None);
  });

  it("Test period calculation", async function () {
    const DAY_IN_SECONDS = 60 * 60 * 24;
    const MONTH_IN_SECONDS = 30 * DAY_IN_SECONDS;

    expect(await staking.getPeriodDuration(StakingTime.Month)).to.equal(MONTH_IN_SECONDS);
    expect(await staking.getPeriodDuration(StakingTime.ThreeMonths)).to.equal(3 * MONTH_IN_SECONDS);
    expect(await staking.getPeriodDuration(StakingTime.SixMonths)).to.equal(6 * MONTH_IN_SECONDS);
    expect(await staking.getPeriodDuration(StakingTime.Year)).to.equal(12 * MONTH_IN_SECONDS);

    await expect(staking.getPeriodDuration(StakingTime.Year + 1)).to.be.revertedWithoutReason();
  });


  it("Test tier by staking amount calculation", async function () {
    expect(await staking.getTierByStakingAmount(parseEther("0"))).to.equal(Tier.None);
    expect(await staking.getTierByStakingAmount(parseEther("332"))).to.equal(Tier.None);

    expect(await staking.getTierByStakingAmount(parseEther("333"))).to.equal(Tier.Fan);
    expect(await staking.getTierByStakingAmount(parseEther("499"))).to.equal(Tier.Fan);

    expect(await staking.getTierByStakingAmount(parseEther("500"))).to.equal(Tier.Merchant);
    expect(await staking.getTierByStakingAmount(parseEther("4999"))).to.equal(Tier.Merchant);

    expect(await staking.getTierByStakingAmount(parseEther("5000"))).to.equal(Tier.Dealer);
    expect(await staking.getTierByStakingAmount(parseEther("49999"))).to.equal(Tier.Dealer);

    expect(await staking.getTierByStakingAmount(parseEther("50000"))).to.equal(Tier.Broker);
    expect(await staking.getTierByStakingAmount(parseEther("99999"))).to.equal(Tier.Broker);

    expect(await staking.getTierByStakingAmount(parseEther("100000"))).to.equal(Tier.Tycoon);
    expect(await staking.getTierByStakingAmount(parseEther("10000100500"))).to.equal(Tier.Tycoon);
  });

  it("Test tier by staking amount calculation if required stake changed", async function () {
    await staking.setRequiredStakeForTier(Tier.None, 0); // Actualy does nothing. Added for cover

    await staking.setRequiredStakeForTier(Tier.Fan, 1333);
    await staking.setRequiredStakeForTier(Tier.Merchant, 1500);
    await staking.setRequiredStakeForTier(Tier.Dealer, 15000);
    await staking.setRequiredStakeForTier(Tier.Broker, 150000);
    await staking.setRequiredStakeForTier(Tier.Tycoon, 11000000);

    expect(await staking.getTierByStakingAmount(parseEther("0"))).to.equal(Tier.None);
    expect(await staking.getTierByStakingAmount(parseEther("1332"))).to.equal(Tier.None);

    expect(await staking.getTierByStakingAmount(parseEther("1333"))).to.equal(Tier.Fan);
    expect(await staking.getTierByStakingAmount(parseEther("1499"))).to.equal(Tier.Fan);

    expect(await staking.getTierByStakingAmount(parseEther("1500"))).to.equal(Tier.Merchant);
    expect(await staking.getTierByStakingAmount(parseEther("14999"))).to.equal(Tier.Merchant);

    expect(await staking.getTierByStakingAmount(parseEther("15000"))).to.equal(Tier.Dealer);
    expect(await staking.getTierByStakingAmount(parseEther("149999"))).to.equal(Tier.Dealer);

    expect(await staking.getTierByStakingAmount(parseEther("150000"))).to.equal(Tier.Broker);
    expect(await staking.getTierByStakingAmount(parseEther("1999999"))).to.equal(Tier.Broker);

    expect(await staking.getTierByStakingAmount(parseEther("11000000"))).to.equal(Tier.Tycoon);
    expect(await staking.getTierByStakingAmount(parseEther("1100000100500"))).to.equal(Tier.Tycoon);
  });

  it("Test allocation bonus calculation", async function () {
    expect(await staking.getAllocationBonusPercentByTime(StakingTime.Month)).to.equal(0);
    expect(await staking.getAllocationBonusPercentByTime(StakingTime.ThreeMonths)).to.equal(10);
    expect(await staking.getAllocationBonusPercentByTime(StakingTime.SixMonths)).to.equal(20);
    expect(await staking.getAllocationBonusPercentByTime(StakingTime.Year)).to.equal(30);
  });

  it("Test staking", async () => {
    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    const userBalanceBeforeStake = await raiseToken.balanceOf(user1.address);

    const stakeBlockId = (await ethers.provider.getBlock("latest")).number + 1;

    const stakeTx = await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);
    const stakeRc = await stakeTx.wait();

    // Test staked and tier obtained events
    
    const stakedEvent = stakeRc.events?.find(event => event.event == 'Staked');
    const tierObtainedEvent = stakeRc.events?.find(event => event.event == 'TierObtained');
    const [stakedUserAddress, poolId, stakingAmount, stakingReward, stakingTime] = stakedEvent?.args!;

    expect(stakedUserAddress).to.equal(user1.address);
    expect(poolId).to.equal(0);
    expect(stakingAmount).to.equal(testAmountToStake);
    expect(stakingReward).to.equal(0);
    expect(stakingTime).to.equal(testTimeOfStaking);

    const [userAddress, newTier] = tierObtainedEvent?.args!;

    expect(userAddress).to.equal(user1.address);
    expect(newTier).to.equal(Tier.Fan);

    // Test user token balance changed correctly

    const userBalanceAfterStake = await raiseToken.balanceOf(user1.address);
    expect(userBalanceAfterStake.eq(userBalanceBeforeStake.sub(testAmountToStake))).to.be.true;

    // Check that getUserTier returns the correct tier
    const [, tier, , , ] = await staking.getUserInfo(user1.address);
    expect(tier).to.equal(Tier.Fan);

    const [userStakeAmount, userStakeDeadline] = await staking.getUserStakeInfo(0, user1.address);

    expect(userStakeAmount).to.equal(testAmountToStake);
    const secondsInMonth = 60 * 60 * 24 * 30;

    const blockAfter = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
    const timestampAfter = blockAfter.timestamp;

    expect(userStakeDeadline.toNumber() - timestampAfter - secondsInMonth).lte(10);

    await ethers.provider.send('hardhat_mine', ["0x100"]); // Increases block number by 256

    const currentBlockId =  (await ethers.provider.getBlock("latest")).number;

    const expectedUserReward = raisePerBlock.mul(BigNumber.from(currentBlockId - stakeBlockId));

    const pendingReward = await staking.getPendingReward(0, user1.address);
    expect(expectedUserReward.sub(pendingReward).abs().lte(EPSILON)).to.be.true;

    const [, , , , allocationBonusPercent] = await staking.getUserInfo(user1.address);
    expect(allocationBonusPercent).to.equal(0);
  });

  it("Test consequential tier achieving", async () => {
    const allocation = parseEther("200000");
    await raiseToken.mint(user1.address, allocation);
    await raiseToken.connect(user1).approve(staking.address, allocation);

    const stakeTx = await staking.connect(user1).stake(0, parseEther("333"), testTimeOfStaking);
    const stakeRc = await stakeTx.wait();

    const tierObtainedEvent = stakeRc.events?.find(event => event.event == 'TierObtained');
    const [userAddress, newTier] = tierObtainedEvent?.args!;
    expect(userAddress).to.equal(user1.address);
    expect(newTier).to.equal(Tier.Fan);

    const unstakeTx2 = await staking.connect(user1).unstake(0, parseEther("1"));
    const unstakeRc2 = await unstakeTx2.wait();

    const tierObtainedEvent2 = unstakeRc2.events?.find(event => event.event == 'TierObtained');
    const [userAddress2, newTier2] = tierObtainedEvent2?.args!;
    expect(userAddress2).to.equal(user1.address);
    expect(newTier2).to.equal(Tier.None);

    const stakeTx3 = await staking.connect(user1).stake(0, parseEther("200"), testTimeOfStaking);
    const stakeRc3 = await stakeTx3.wait();

    const tierObtainedEvent3 = stakeRc3.events?.find(event => event.event == 'TierObtained');
    const [userAddress3, newTier3] = tierObtainedEvent3?.args!;
    expect(userAddress3).to.equal(user1.address);
    expect(newTier3).to.equal(Tier.Merchant);

    const stakeTx4 = await staking.connect(user1).stake(0, parseEther("1"), testTimeOfStaking);
    const stakeRc4 = await stakeTx4.wait();

    const tierObtainedEvent4 = stakeRc4.events?.find(event => event.event == 'TierObtained');
    expect(tierObtainedEvent4).to.be.undefined;

    const unstakeTx5 = await staking.connect(user1).unstake(0, parseEther("1"));
    const unstakeRc5 = await unstakeTx5.wait();

    const tierObtainedEvent5 = unstakeRc5.events?.find(event => event.event == 'TierObtained');
    expect(tierObtainedEvent5).to.be.undefined;

    await fakeToken1.transfer(user1.address, allocation);
    await fakeToken1.connect(user1).approve(staking.address, allocation);

    await staking.createPool(10, fakeToken1.address);

    const stakeTx6 = await staking.connect(user1).stake(1, parseEther("333"), testTimeOfStaking);
    const stakeRc6 = await stakeTx6.wait();

    const tierObtainedEvent6 = stakeRc6.events?.find(event => event.event == 'TierObtained');
    expect(tierObtainedEvent6).to.be.undefined;


    const unstakeTx7 = await staking.connect(user1).unstake(1, parseEther("333"));
    const unstakeRc7 = await unstakeTx7.wait();

    const tierObtainedEvent7 = unstakeRc7.events?.find(event => event.event == 'TierObtained');
    expect(tierObtainedEvent7).to.be.undefined;
  });

  it("Check that user can't stake zero tokens", async () => {
    await expect(staking.connect(user1).stake(0, 0, testTimeOfStaking)).to.be.revertedWith("Unable to stake 0 tokens");
  });

  it("Test unstaking without penalty", async () => {
    const testAmountToStake = parseEther("555");
    const serviceInitialBalance = await staking.serviceBalance();

    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    const stakeBlockId = (await ethers.provider.getBlock("latest")).number + 1;

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    expect(await staking.getStakedTokenAmount(0)).to.equal(testAmountToStake);

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]); // Inc block number by 256 with time increasing by 65536 secs

    const userBalanceBeforeUnstake = await raiseToken.balanceOf(user1.address);

    const unstakeTx = await staking.connect(user1).unstake(0, testAmountToStake);
    const unstakeRc = await unstakeTx.wait();
    const unstakeEvent = unstakeRc.events?.find(x => x.event == 'Unstaked');

    const currentBlockId = (await ethers.provider.getBlock("latest")).number;
    
    const [unstakedUser, unstakedPoolId, unstakedAmount, unstakedReward, unstakedWithPenalty] = unstakeEvent?.args!;

    expect(unstakedUser).to.equal(user1.address);
    expect(unstakedPoolId).to.equal(0);
    expect(unstakedAmount).to.equal(testAmountToStake);
    expect(unstakedWithPenalty).to.be.false;

    const expectedUserReward = raisePerBlock.mul(BigNumber.from(currentBlockId - stakeBlockId));

    expect(expectedUserReward.sub(unstakedReward).abs().lte(EPSILON)).to.be.true;

    const userBalanceAfterUnstake = await raiseToken.balanceOf(user1.address);
    expect(userBalanceAfterUnstake.sub(userBalanceBeforeUnstake).eq(unstakedAmount.add(unstakedReward))).to.be.true;

    const serviceFinalBalance = await staking.serviceBalance();

    expect(serviceInitialBalance.sub(serviceFinalBalance).eq(unstakedReward)).to.be.true;
    expect(await staking.getStakedTokenAmount(0)).to.equal(0);
  });

  it("Test that user can't unstake twice", async () => {
    const testAmountToStake = parseEther("555");

    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);
    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]); // Inc block number by 256 with time increasing by 65536 secs
    await staking.connect(user1).unstake(0, testAmountToStake);
    await expect(staking.connect(user1).unstake(0, testAmountToStake)).to.be.revertedWith("Not enough balance");
  });

  it("Test emergency unstaking without penalty", async () => {
    const testAmountToStake = parseEther("555");

    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);
    expect(await staking.getStakedTokenAmount(0)).to.equal(testAmountToStake);

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]); // Inc block number by 256 with time increasing by 65536 secs

    const unstakeTx = await staking.connect(user1).emergencyUnstake(0);
    const unstakeRc = await unstakeTx.wait();
    const unstakeEvent = unstakeRc.events?.find(x => x.event == 'EmergencyUnstaked');
    
    const [unstakedUser, unstakedPoolId, unstakedAmount, unstakedWithPenalty] = unstakeEvent?.args!;

    expect(unstakedUser).to.equal(user1.address);
    expect(unstakedPoolId).to.equal(0);
    expect(unstakedAmount).to.equal(testAmountToStake);
    expect(unstakedWithPenalty).to.be.false;    
    expect(await staking.getStakedTokenAmount(0)).to.equal(0);
  });

  it("Test user can't emergency unstaking if he has no stake", async () => {
    await expect(staking.connect(user1).emergencyUnstake(0)).to.be.revertedWith("Not enough balance");
  });


  it("Test unstaking without penalty if user has fan tier", async () => {
    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    await staking.setPenaltyPercent(penaltyPercent);

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    await ethers.provider.send('hardhat_mine', ["0x100"]); // Inc block number by 256 without time increasing

    const unstakeTx = await staking.connect(user1).unstake(0, testAmountToStake);
    const unstakeRc = await unstakeTx.wait();
    const unstakeEvent = unstakeRc.events?.find(x => x.event == 'Unstaked');
    
    const [unstakedUser, unstakedPoolId, unstakedAmount, unstakedReward, unstakedWithPenalty] = unstakeEvent?.args!;

    expect(unstakedUser).to.equal(user1.address);
    expect(unstakedPoolId).to.equal(0);
    expect(unstakedWithPenalty).to.be.false;  // Because user tier is fun, he have no penalty
  });

  it("Test unstaking with penalty", async () => {
    const serviceInitialBalance = await staking.serviceBalance();

    const testAmountToStake = parseEther("555");

    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    await staking.setPenaltyPercent(penaltyPercent);

    const stakeBlockId = (await ethers.provider.getBlock("latest")).number + 1;

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    await ethers.provider.send('hardhat_mine', ["0x100"]); // Inc block number by 256 without time increasing

    const userBalanceBeforeUnstake = await raiseToken.balanceOf(user1.address);

    const unstakeTx = await staking.connect(user1).unstake(0, testAmountToStake);
    const unstakeRc = await unstakeTx.wait();
    const unstakeEvent = unstakeRc.events?.find(x => x.event == 'Unstaked');

    const currentBlockId = (await ethers.provider.getBlock("latest")).number;
    
    const [unstakedUser, unstakedPoolId, unstakedAmount, unstakedReward, unstakedWithPenalty] = unstakeEvent?.args!;

    expect(unstakedUser).to.equal(user1.address);
    expect(unstakedPoolId).to.equal(0);
    expect(unstakedAmount).to.equal(testAmountToStake.mul(100-penaltyPercent).div(100));
    expect(unstakedWithPenalty).to.be.true;

    const expectedUserReward = raisePerBlock.mul(BigNumber.from(currentBlockId - stakeBlockId));

    expect(expectedUserReward.sub(unstakedReward).abs().lte(EPSILON)).to.be.true;

    const userBalanceAfterUnstake = await raiseToken.balanceOf(user1.address);
    expect(userBalanceAfterUnstake.sub(userBalanceBeforeUnstake).eq(unstakedAmount.add(unstakedReward))).to.be.true;

    const paidPenalty = testAmountToStake.sub(unstakedAmount);

    const serviceFinalBalance = await staking.serviceBalance();

    expect(serviceInitialBalance.add(paidPenalty).sub(unstakedReward).eq(serviceFinalBalance)).to.be.true;
  });

  it("Test emergency unstaking with penalty", async () => {
    const serviceInitialBalance = await staking.serviceBalance();

    const testAmountToStake = parseEther("555");

    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    await staking.setPenaltyPercent(penaltyPercent);

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    await ethers.provider.send('hardhat_mine', ["0x100"]); // Inc block number by 256 without time increasing

    const userBalanceBeforeUnstake = await raiseToken.balanceOf(user1.address);

    const unstakeTx = await staking.connect(user1).emergencyUnstake(0);
    const unstakeRc = await unstakeTx.wait();
    const unstakeEvent = unstakeRc.events?.find(x => x.event == 'EmergencyUnstaked');
    
    const [unstakedUser, unstakedPoolId, unstakedAmount, unstakedWithPenalty] = unstakeEvent?.args!;

    expect(unstakedUser).to.equal(user1.address);
    expect(unstakedPoolId).to.equal(0);
    expect(unstakedAmount).to.equal(testAmountToStake.mul(100-penaltyPercent).div(100));
    expect(unstakedWithPenalty).to.be.true;

    const userBalanceAfterUnstake = await raiseToken.balanceOf(user1.address);
    expect(userBalanceAfterUnstake.sub(userBalanceBeforeUnstake).eq(unstakedAmount)).to.be.true;

    const paidPenalty = testAmountToStake.sub(unstakedAmount);

    const serviceFinalBalance = await staking.serviceBalance();

    expect(serviceInitialBalance.add(paidPenalty).eq(serviceFinalBalance)).to.be.true;
  });


  it("Check that user can't unstake more than he have", async () => {
    await expect(staking.connect(user1).unstake(0, testAmountToStake)).to.be.revertedWith("Not enough balance");
  });

  it("Test reward withdrawing after second stake", async () => {
    await raiseToken.transfer(user1.address, testAmountToStake.mul(2));
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake.mul(2));

    const stakeBlockId = (await ethers.provider.getBlock("latest")).number + 1;

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]);

    const timeOfSecondStaking = StakingTime.ThreeMonths;
    const stakeTx = await staking.connect(user1).stake(0, testAmountToStake, timeOfSecondStaking);

    const secondStakeBlockId = (await ethers.provider.getBlock("latest")).number;
    const expectedUserReward = raisePerBlock.mul(BigNumber.from(secondStakeBlockId - stakeBlockId));

    const stakeRc = await stakeTx.wait();
    
    const stakedEvent = stakeRc.events?.find(event => event.event == 'Staked');
    const tierObtainedEvent = stakeRc.events?.find(event => event.event == 'TierObtained');

    const [stakedUserAddress, poolId, stakingAmount, stakingReward, stakingTime] = stakedEvent?.args!;

    expect(stakedUserAddress).to.equal(user1.address);
    expect(poolId).to.equal(0);
    expect(stakingAmount).to.equal(testAmountToStake);

    expect(stakingReward.sub(expectedUserReward).abs().lte(EPSILON)).to.be.true;
    expect(stakingTime).to.equal(timeOfSecondStaking);

    const [userAddress, newTier] = tierObtainedEvent?.args!;

    expect(userAddress).to.equal(user1.address);
    expect(newTier).to.equal(Tier.Merchant);  // Tier successfully updated based on the second stake
    const [, , , , allocationBonusPercent] = await staking.getUserInfo(user1.address);

    expect(allocationBonusPercent).to.equal(10);  // Allocation points updated based on second stake time
  });

  it("Test claiming", async () => {
    const testAmountToStake = parseEther("555");
    const serviceInitialBalance = await staking.serviceBalance();

    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    const stakeBlockId = (await ethers.provider.getBlock("latest")).number + 1;

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]); // Inc block number by 256 with time increasing by 65536 secs

    const userBalanceBeforeUnstake = await raiseToken.balanceOf(user1.address);

    const claimTx = await staking.connect(user1).claim(0);
    const claimRc = await claimTx.wait();
    const claimEvent = claimRc.events?.find(x => x.event == 'Claimed');

    const currentBlockId = (await ethers.provider.getBlock("latest")).number;
    
    const [claimedUser, claimedPoolId, claimedReward] = claimEvent?.args!;

    expect(claimedUser).to.equal(user1.address);
    expect(claimedPoolId).to.equal(0);
    
    const expectedUserReward = raisePerBlock.mul(BigNumber.from(currentBlockId - stakeBlockId));

    expect(expectedUserReward.sub(claimedReward).abs().lte(EPSILON)).to.be.true;

    const userBalanceAfterUnstake = await raiseToken.balanceOf(user1.address);
    //expect(userBalanceAfterUnstake.sub(userBalanceBeforeUnstake).eq(testAmountToStake.add(claimedReward))).to.be.true;  todo

    const serviceFinalBalance = await staking.serviceBalance();

    expect(serviceInitialBalance.sub(serviceFinalBalance).eq(claimedReward)).to.be.true;

  });

  it("Check that user can't claim is service has no funds", async () => {
    await staking.withdraw(await staking.serviceBalance());

    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]);

    await expect(staking.connect(user1).claim(0)).to.be.revertedWith("Service balance is empty");
    });

  it("Test ticket calculation", async () => {
    const tokensToTransfer = parseEther("10000");

    await raiseToken.transfer(user1.address, tokensToTransfer);
    await raiseToken.connect(user1).approve(staking.address, tokensToTransfer);

    const test1AmountToStake = parseEther("333");

    await staking.connect(user1).stake(0, test1AmountToStake, testTimeOfStaking);

    const stakeTime = (await ethers.provider.getBlock("latest")).timestamp;

    const [userTickets1, tier1, stake1, deadline1, allocationBonusPercent1] = await staking.getUserInfo(user1.address);
    expect(userTickets1).to.equal(33);
    expect(tier1).to.equal(Tier.Fan);
    expect(stake1).to.equal(test1AmountToStake);

    const test2AmountToStake = parseEther("500");

    await staking.connect(user1).stake(0, test2AmountToStake, testTimeOfStaking);

    const [userTickets2, tier2, stake2, deadline2, allocationBonusPercent2] = await staking.getUserInfo(user1.address);
    expect(userTickets2).to.equal(83);  // (500 + 333) // 10
    expect(tier2).to.equal(Tier.Merchant);
    expect(stake2).to.equal(test1AmountToStake.add(test2AmountToStake));

    const test3AmountToStake = parseEther("1500");

    await staking.connect(user1).stake(0, test3AmountToStake, testTimeOfStaking);

    const [userTickets3, tier3, stake3, deadline3, allocationBonusPercent3, stakedAt] = await staking.getUserInfo(user1.address);
    expect(userTickets3).to.equal(233);  // (1500 + 500 + 333) // 10
    expect(stakedAt).to.equal(stakeTime);

    expect(tier3).to.equal(Tier.Merchant);
    expect(stake3).to.equal(test1AmountToStake.add(test2AmountToStake).add(test3AmountToStake));

    await staking.connect(user1).unstake(0, stake3); 
    const unstakeTime = (await ethers.provider.getBlock("latest")).timestamp;

    const userInfo4 = await staking.getUserInfo(user1.address);
    expect(userInfo4.stakedAt).to.equal(unstakeTime);

  });

  it("Test stakers info fetching", async () => {
    const tokensToTransfer = parseEther("10000");

    for(const user of [user1, user2, user3, user4, user5]) {
      await raiseToken.transfer(user.address, tokensToTransfer);
      await raiseToken.connect(user).approve(staking.address, tokensToTransfer);
    }

    const test1AmountToStake = parseEther("332");
    await staking.connect(user1).stake(0, test1AmountToStake, testTimeOfStaking);
    

    const test2AmountToStake = parseEther("333");
    await staking.connect(user2).stake(0, test2AmountToStake, testTimeOfStaking);

    const test3AmountToStake = parseEther("500");
    await staking.connect(user3).stake(0, test3AmountToStake, testTimeOfStaking);

    const test4AmountToStake = parseEther("1500");
    await staking.connect(user4).stake(0, test4AmountToStake, testTimeOfStaking);

    const test5AmountToStake = parseEther("9000");
    await staking.connect(user5).stake(0, test5AmountToStake, testTimeOfStaking);

    const queriedNoTierLotteryInfo = await staking.getStakerLotteryInfos([user1.address]);
    expect(queriedNoTierLotteryInfo.length).to.equal(1);
    expect(queriedNoTierLotteryInfo[0].user).to.equal(user1.address);
    const [noTierTickets, ] = await staking.getUserInfo(queriedNoTierLotteryInfo[0].user);
    expect(queriedNoTierLotteryInfo[0].tickets).to.equal(noTierTickets);
    expect(queriedNoTierLotteryInfo[0].tier).to.equal(Tier.None);

    const queriedFanLotteryInfo = await staking.getStakerLotteryInfos([user2.address]);
    expect(queriedFanLotteryInfo.length).to.equal(1);
    expect(queriedFanLotteryInfo[0].user).to.equal(user2.address);
    const [fanTickets, ] = await staking.getUserInfo(queriedFanLotteryInfo[0].user);
    expect(queriedFanLotteryInfo[0].tickets).to.equal(fanTickets);
    expect(queriedFanLotteryInfo[0].tier).to.equal(Tier.Fan);

    const queriedMetchantLotteryInfo = await staking.getStakerLotteryInfos([user3.address, user4.address]);
    expect(queriedMetchantLotteryInfo.length).to.equal(2);
    expect(queriedMetchantLotteryInfo[0].user).to.equal(user3.address);
    expect(queriedMetchantLotteryInfo[1].user).to.equal(user4.address);

    const [fanTickets1, ] = await staking.getUserInfo(queriedMetchantLotteryInfo[0].user);
    expect(queriedMetchantLotteryInfo[0].tickets).to.equal(fanTickets1);
    const [fanTickets2, ] = await staking.getUserInfo(queriedMetchantLotteryInfo[1].user);
    expect(queriedMetchantLotteryInfo[1].tickets).to.equal(fanTickets2);

    const queriedNullAddressInfo = await staking.getStakerLotteryInfos([NULL_ADDRESS]);
    expect(queriedNullAddressInfo[0].user == owner.address);
    expect(queriedNullAddressInfo[0].tier == Tier.None);
  });

  it("Test null address info fetching", async () => {

    const queriedNoTierLotteryInfo = await staking.getStakerLotteryInfos([user2.address]);
    expect(queriedNoTierLotteryInfo.length).to.equal(1);
    expect(queriedNoTierLotteryInfo[0].user).to.equal(user2.address);
    expect(queriedNoTierLotteryInfo[0].tier).to.equal(Tier.None);
    expect(queriedNoTierLotteryInfo[0].stakedAt).to.equal(0);
    expect(queriedNoTierLotteryInfo[0].tickets).to.equal(0);
    expect(queriedNoTierLotteryInfo[0].allocationBonusPercent).to.equal(0);
  })

  it("Test ticket info collection", async () => {
    const tokensToTransfer = parseEther("10000");

    for(const user of [user1, user2, user3, user4, user5]) {
      await raiseToken.transfer(user.address, tokensToTransfer);
      await raiseToken.connect(user).approve(staking.address, tokensToTransfer);
    }

    const test1AmountToStake = parseEther("332");
    await staking.connect(user1).stake(0, test1AmountToStake, testTimeOfStaking);

    const test2AmountToStake = parseEther("333");
    await staking.connect(user2).stake(0, test2AmountToStake, testTimeOfStaking);

    const test3AmountToStake = parseEther("500");
    await staking.connect(user3).stake(0, test3AmountToStake, testTimeOfStaking);

    const test4AmountToStake = parseEther("1500");
    await staking.connect(user4).stake(0, test4AmountToStake, testTimeOfStaking);

    const test5AmountToStake = parseEther("9000");
    await staking.connect(user5).stake(0, test5AmountToStake, testTimeOfStaking);

    const merchantTicketInfos = await staking.getStakerLotteryInfos([user3.address, user4.address]);
    const dealerTicketInfos = await staking.getStakerLotteryInfos([user5.address]);

    expect(merchantTicketInfos.find(x => x.user == user3.address)?.tickets).to.equal(50);
    expect(merchantTicketInfos.find(x => x.user == user4.address)?.tickets).to.equal(150);
    expect(dealerTicketInfos.find(x => x.user == user5.address)?.tickets).to.equal(900);
  });

  it("Test case if service has no funds", async () => {
    const Staking = await ethers.getContractFactory("Staking");
    const staking1 = await Staking.deploy(raiseToken.address, raisePerBlock);
    await staking1.deployed();
    await raiseToken.transfer(user1.address, testAmountToStake.mul(3));
    await raiseToken.connect(user1).approve(staking1.address, testAmountToStake.mul(3));

    await staking1.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);
    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]);
    await expect(staking1.connect(user1).unstake(0, testAmountToStake)).to.be.revertedWith("Service balance is empty");
    await expect(staking1.connect(user1).stake(0, testAmountToStake, testTimeOfStaking)).to.be.revertedWith("Service balance is empty");
  });

  it("Check that admin can't create two pools for the same token", async () => {
    await staking.createPool(10, fakeToken1.address);
    await expect(staking.createPool(10, fakeToken1.address)).to.be.revertedWith("Such pool already created");
  });

  it("Check pool reward distribution", async () => {
    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    await fakeToken1.transfer(user1.address, testAmountToStake);
    await fakeToken1.connect(user1).approve(staking.address, testAmountToStake);

    await staking.createPool(500, fakeToken1.address);

    const userBalanceBeforeStake = await raiseToken.balanceOf(user1.address);

    const stakeBlockId = (await ethers.provider.getBlock("latest")).number + 1;

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);
    await staking.connect(user1).stake(1, testAmountToStake, testTimeOfStaking);
    
    const userBalanceAfterStake = await raiseToken.balanceOf(user1.address);
    expect(userBalanceAfterStake.eq(userBalanceBeforeStake.sub(testAmountToStake))).to.be.true;

    await ethers.provider.send('hardhat_mine', ["0x100"]); // Increases block number by 256

    const currentBlockId =  (await ethers.provider.getBlock("latest")).number;

    const expectedUserReward = raisePerBlock.mul(BigNumber.from(currentBlockId - stakeBlockId));

    const pendingReward1 = await staking.getPendingReward(0, user1.address);
    const pendingReward2 = await staking.getPendingReward(1, user1.address);
    expect(pendingReward1.add(pendingReward2).sub(expectedUserReward).abs().lte(parseEther("10"))).to.be.true;
    expect(pendingReward1.sub(pendingReward2.mul(2)).abs().lte(parseEther("10"))).to.be.true;
  });

  it("Test staking pausing", async () => {
    await staking.pause();
    await expect(staking.stake(0, testAmountToStake, testTimeOfStaking)).to.be.revertedWith("Pausable: paused");
    await expect(staking.unstake(0, testAmountToStake)).to.be.revertedWith("Pausable: paused");
    await expect(staking.emergencyUnstake(0)).to.be.revertedWith("Pausable: paused");
    await expect(staking.updatePool(0)).to.be.revertedWith("Pausable: paused");
    await expect(staking.claim(0)).to.be.revertedWith("Pausable: paused");

    await staking.unpause();

    await expect(staking.stake(0, testAmountToStake, testTimeOfStaking)).not.to.be.revertedWith("Pausable: paused");
    await expect(staking.unstake(0, testAmountToStake)).not.to.be.revertedWith("Pausable: paused");
    await expect(staking.emergencyUnstake(0)).not.to.be.revertedWith("Pausable: paused");
    await expect(staking.updatePool(0)).not.to.be.revertedWith("Pausable: paused");
    await expect(staking.claim(0)).not.to.be.revertedWith("Pausable: paused");
  });

  it("Test double unstaking", async () => {
    const testAmountToStake1 = parseEther("555");
    const testAmountToStake = parseEther("333");

    const serviceInitialBalance = await staking.serviceBalance();

    await raiseToken.transfer(user1.address, testAmountToStake1.add(testAmountToStake));
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake1.add(testAmountToStake));


    await staking.connect(user1).stake(0, testAmountToStake1, testTimeOfStaking);

    {
      const [userTickets, tier, stake, deadline, allocationBonusPercent] = await staking.getUserInfo(user1.address);
      expect(tier).to.equal(Tier.Merchant);
    }

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]); // Inc block number by 256 with time increasing by 65536 secs
    await staking.connect(user1).unstake(0, testAmountToStake1);

    {
      const [userTickets, tier, stake, deadline, allocationBonusPercent] = await staking.getUserInfo(user1.address);
      expect(tier).to.equal(Tier.None);
    }


    const stakeBlockId = (await ethers.provider.getBlock("latest")).number + 1;

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10"]);

    const userBalanceBeforeUnstake = await raiseToken.balanceOf(user1.address);

    {
      const [userTickets, tier, stake, deadline, allocationBonusPercent] = await staking.getUserInfo(user1.address);
      expect(tier).to.equal(Tier.Fan);
    }

    const unstakeTx = await staking.connect(user1).unstake(0, testAmountToStake);
    const unstakeRc = await unstakeTx.wait();

    const unstakeEvent = unstakeRc.events?.find(x => x.event == 'Unstaked');

    const currentBlockId = (await ethers.provider.getBlock("latest")).number;
    
    const [unstakedUser, unstakedPoolId, unstakedAmount, unstakedReward, unstakedWithPenalty] = unstakeEvent?.args!;

    expect(unstakedUser).to.equal(user1.address);
    expect(unstakedPoolId).to.equal(0);
    expect(unstakedAmount).to.equal(testAmountToStake);
    expect(unstakedWithPenalty).to.be.false;

    //const expectedUserReward = raisePerBlock.mul(BigNumber.from(currentBlockId - stakeBlockId));

    // expect(expectedUserReward.sub(unstakedReward).abs().lte(EPSILON)).to.be.true;

    // const userBalanceAfterUnstake = await raiseToken.balanceOf(user1.address);
    // expect(userBalanceAfterUnstake.sub(userBalanceBeforeUnstake).eq(unstakedAmount.add(unstakedReward))).to.be.true;

    // const serviceFinalBalance = await staking.serviceBalance();

    // expect(serviceInitialBalance.sub(serviceFinalBalance).eq(unstakedReward)).to.be.true;
  });

  it("Test money withdrawing", async () => {
    const userRaiseBalanceBeforeWithdraw = await raiseToken.balanceOf(owner.address);
    await staking.withdraw(await staking.serviceBalance());
    const userRaiseBalanceAfterWithdraw = await raiseToken.balanceOf(owner.address);
    expect(userRaiseBalanceAfterWithdraw.gt(userRaiseBalanceBeforeWithdraw)).to.be.true;
  });

  it("Test user can't withdraw more money than service have ", async () => {
    await expect(staking.withdraw(await (await staking.serviceBalance()).add(1))).to.be.revertedWith("Not enough service balance");
  });

  it("Test staked token amount correctness", async () => {
    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);
    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    await raiseToken.transfer(user2.address, testAmountToStake);
    await raiseToken.connect(user2).approve(staking.address, testAmountToStake);
    await staking.connect(user2).stake(0, testAmountToStake, testTimeOfStaking);

    expect((await staking.getStakedTokenAmount(0)).eq(testAmountToStake.mul(2)));
  });

  it("Test staking with lower deadline", async () => {
    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    const currentBlock = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
    const currentTimestamp = currentBlock.timestamp;

    await staking.connect(user1).stake(0, testAmountToStake.div(2), StakingTime.Year);
    await staking.connect(user1).stake(0, testAmountToStake.div(2), StakingTime.Month);

    const [, userStakeDeadline] = await staking.getUserStakeInfo(0, user1.address);

    const secondsInYear = await staking.getPeriodDuration(StakingTime.Year);
    expect(userStakeDeadline.sub(currentTimestamp).sub(secondsInYear).abs().lte(10)).to.be.true;
  });

  it("Check zero pending reward in non-zero pools", async () => {
    const pendingReward = await staking.getPendingReward(0, user1.address);
    expect(pendingReward.eq(0)).to.be.true;
  });

  it("Check raise per block changing", async () => {
    const newRaisePerBlock = parseEther("0.123");
    await staking.setRaisePerBlock(newRaisePerBlock);
    expect(await staking.raisePerBlock()).to.equal(newRaisePerBlock);
  });

  it("Check raise per block and allocation points changing", async () => {
    const newRaisePerBlock = parseEther("0.123");
    const newAllocationPoints = 123;

    await staking.setRaisePerBlock(newRaisePerBlock);
    expect(await staking.raisePerBlock()).to.equal(newRaisePerBlock);

    await staking.setAllocPoints(0, newAllocationPoints);
    expect((await staking.pools(0)).allocPoints).to.equal(newAllocationPoints);
  });

  it("Test that only owner can create a new pool", async () => {
    await expect(staking.connect(user1).createPool(0, NULL_ADDRESS)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Test that only owner can withdraw", async () => {
    await expect(staking.connect(user1).withdraw(1)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Test that only owner can set allocation points", async () => {
    await expect(staking.connect(user1).setAllocPoints(0, 1)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Test that only owner can set prenalty percent", async () => {
    await expect(staking.connect(user1).setPenaltyPercent(1)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Test that only owner can set raise per block", async () => {
    await expect(staking.connect(user1).setRaisePerBlock(0)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Test that only owner can set required stake for tier", async () => {
    await expect(staking.connect(user1).setRequiredStakeForTier(0, 0)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Test that only owner can pause the contract", async () => {
    await expect(staking.connect(user1).pause()).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Test that only owner can unpause the contract", async () => {
    await expect(staking.connect(user1).unpause()).to.be.revertedWith("Ownable: caller is not the owner");
  });





});
