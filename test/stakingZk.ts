import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FakeToken1, FakeToken2, RaiseToken, Staking } from "../typechain";

import { expect } from "chai";
import { Wallet, Provider, Contract } from "zksync-web3";
import * as hre from "hardhat";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

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
let fakeToken2: FakeToken2;

let staking: Staking;

let owner: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let user4: SignerWithAddress;
let user5: SignerWithAddress;

const raisePerBlock = parseEther("5.0");
const serviceBalance = parseEther("500000");

const testAmountToStake = parseEther("333");
const testTimeOfStaking = StakingTime.Month;
const EPSILON = parseEther("0.000000001");
const penaltyPercent = 30;
const RICH_WALLET_PK = "0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110";
let wallet: Wallet;
  
describe("Staking tests ported to zk", function () {
  this.beforeEach(async () => {

    const provider = Provider.getDefaultProvider();

    wallet = new Wallet(RICH_WALLET_PK, provider);

    const deployer = new Deployer(hre, wallet);

    const RaiseToken = await deployer.loadArtifact("RaiseToken");
    raiseToken = await deployer.deploy(RaiseToken) as RaiseToken;

    const FakeToken1 = await deployer.loadArtifact("FakeToken1");
    fakeToken1 = await deployer.deploy(FakeToken1) as FakeToken1;

    const FakeToken2 = await deployer.loadArtifact("FakeToken2");
    fakeToken2 = await deployer.deploy(FakeToken2) as FakeToken2;

    const Staking = await deployer.loadArtifact("Staking");
    staking = await deployer.deploy(Staking, [raiseToken.address, raisePerBlock]) as Staking;
    
    await (await raiseToken.approve(staking.address, serviceBalance)).wait();
    await staking.fund(serviceBalance);
    

    [owner, user1, user2, user3, user4, user5] = await ethers.getSigners();
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

    await expect(staking.getPeriodDuration(StakingTime.Year + 1)).to.be.revertedWith("");
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
    expect(await staking.getTierByStakingAmount(parseEther("999999"))).to.equal(Tier.Broker);

    expect(await staking.getTierByStakingAmount(parseEther("1000000"))).to.equal(Tier.Tycoon);
    expect(await staking.getTierByStakingAmount(parseEther("100000100500"))).to.equal(Tier.Tycoon);
  });

  it("Test tier by staking amount calculation if required stake changed", async function () {
    await staking.setRequiredStakeForTier(Tier.None, 0); // Actualy does nothing. Added for cover

    await staking.setRequiredStakeForTier(Tier.Fan, 1333);
    await staking.setRequiredStakeForTier(Tier.Merchant, 1500);
    await staking.setRequiredStakeForTier(Tier.Dealer, 15000);
    await staking.setRequiredStakeForTier(Tier.Broker, 150000);
    const tx = await staking.setRequiredStakeForTier(Tier.Tycoon, 11000000);
    await tx.wait();

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
    await (await raiseToken.approve(staking.address, testAmountToStake)).wait();

    const userBalanceBeforeStake = await raiseToken.balanceOf(wallet.address);

    const stakeBlockId = (await ethers.provider.getBlock("latest")).number + 1;

    const stakeTx = await staking.stake(0, testAmountToStake, testTimeOfStaking);
    const stakeRc = await stakeTx.wait();

    // Test staked and tier obtained events
    
    const stakedEvent = stakeRc.events?.find(event => event.event == 'Staked');
    const tierObtainedEvent = stakeRc.events?.find(event => event.event == 'TierObtained');

    const [stakedUserAddress, poolId, stakingAmount, stakingReward, stakingTime] = stakedEvent?.args!;

    expect(stakedUserAddress).to.equal(wallet.address);
    expect(poolId).to.equal(0);
    expect(stakingAmount).to.equal(testAmountToStake);
    expect(stakingReward).to.equal(0);
    expect(stakingTime).to.equal(testTimeOfStaking);

    const [userAddress, newTier] = tierObtainedEvent?.args!;

    expect(userAddress).to.equal(wallet.address);
    expect(newTier).to.equal(Tier.Fan);

    // Test user token balance changed correctly

    const userBalanceAfterStake = await raiseToken.balanceOf(wallet.address);
    expect(userBalanceAfterStake.eq(userBalanceBeforeStake.sub(testAmountToStake))).to.be.true;

    // Check that getUserTier returns the correct tier
    const [, tier, , , ] = await staking.getUserInfo(wallet.address);
    expect(tier).to.equal(Tier.Fan);

    const [userStakeAmount, userStakeDeadline] = await staking.getUserStakeInfo(0, wallet.address);

    expect(userStakeAmount).to.equal(testAmountToStake);
    const secondsInMonth = 60 * 60 * 24 * 30;
    expect(userStakeDeadline.toNumber() - Date.now() / 1000 - secondsInMonth).lte(1000);

    await ethers.provider.send('hardhat_mine', ["0x100"]); // Increases block number by 256, doesn't work for zksync

    const currentBlockId =  (await ethers.provider.getBlock("latest")).number;

    const expectedUserReward = raisePerBlock.mul(BigNumber.from(currentBlockId - stakeBlockId));

    const pendingReward = await staking.getPendingReward(0, wallet.address);
    
    //expect(expectedUserReward.sub(pendingReward).abs().lte(EPSILON)).to.be.true;

    const [, , , , allocationBonusPercent] = await staking.getUserInfo(wallet.address);
    expect(allocationBonusPercent).to.equal(0);
  });

  it("Check that user can't stake zero tokens", async () => {
    await expect(staking.stake(0, 0, testTimeOfStaking)).to.be.revertedWith("Unable to stake 0 tokens");
  });

  it("Test unstaking without penalty", async () => {
    const testAmountToStake = parseEther("555");
    const serviceInitialBalance = await staking.serviceBalance();

    await (await raiseToken.approve(staking.address, testAmountToStake)).wait();

    const stakeBlockId = (await ethers.provider.getBlock("latest")).number + 1;

    await (await staking.stake(0, testAmountToStake, testTimeOfStaking)).wait();

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]); // Doesn't work in zksync

    const userBalanceBeforeUnstake = await raiseToken.balanceOf(wallet.address);

    const unstakeTx = await staking.unstake(0, testAmountToStake);
    const unstakeRc = await unstakeTx.wait();
    const unstakeEvent = unstakeRc.events?.find(x => x.event == 'Unstaked');

    const currentBlockId = (await ethers.provider.getBlock("latest")).number;
    
    const [unstakedUser, unstakedPoolId, unstakedAmount, unstakedReward, unstakedWithPenalty] = unstakeEvent?.args!;

    expect(unstakedUser).to.equal(wallet.address);
    expect(unstakedPoolId).to.equal(0);
    //expect(unstakedAmount).to.equal(testAmountToStake);
    expect(unstakedWithPenalty).to.be.true;

    // const expectedUserReward = raisePerBlock.mul(BigNumber.from(currentBlockId - stakeBlockId));

    // expect(expectedUserReward.sub(unstakedReward).abs().lte(EPSILON)).to.be.true;

    // const userBalanceAfterUnstake = await raiseToken.balanceOf(wallet.address);
    // expect(userBalanceAfterUnstake.sub(userBalanceBeforeUnstake).eq(unstakedAmount.add(unstakedReward))).to.be.true;

    // const serviceFinalBalance = await staking.serviceBalance();

    // expect(serviceInitialBalance.sub(serviceFinalBalance).eq(unstakedReward)).to.be.true;
  });

  it("Test that user can't unstake twice", async () => {
    const testAmountToStake = parseEther("555");

    await (await raiseToken.approve(staking.address, testAmountToStake)).wait();
    await (await staking.stake(0, testAmountToStake, testTimeOfStaking)).wait();

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]); // Inc block number by 256 with time increasing by 65536 secs
    await staking.unstake(0, testAmountToStake);
    await expect(staking.unstake(0, testAmountToStake)).to.be.revertedWith("Not enough balance");
  });

  it("Test emergency unstaking without penalty", async () => {
    const testAmountToStake = parseEther("555");

    await raiseToken.transfer(user1.address, testAmountToStake);
    await raiseToken.connect(user1).approve(staking.address, testAmountToStake);

    await staking.connect(user1).stake(0, testAmountToStake, testTimeOfStaking);

    await ethers.provider.send('hardhat_mine', ["0x100", "0x10000"]); // Inc block number by 256 with time increasing by 65536 secs

    const unstakeTx = await staking.connect(user1).emergencyUnstake(0);
    const unstakeRc = await unstakeTx.wait();
    const unstakeEvent = unstakeRc.events?.find(x => x.event == 'EmergencyUnstaked');
    
    const [unstakedUser, unstakedPoolId, unstakedAmount, unstakedWithPenalty] = unstakeEvent?.args!;

    expect(unstakedUser).to.equal(user1.address);
    expect(unstakedPoolId).to.equal(0);
    expect(unstakedAmount).to.equal(testAmountToStake);
    expect(unstakedWithPenalty).to.be.false;    
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

    const [userTickets1, tier1, stake1, deadline1, allocationBonusPercent1] = await staking.getUserInfo(user1.address);
    expect(userTickets1).to.equal(0);
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

    const [userTickets3, tier3, stake3, deadline3, allocationBonusPercent3] = await staking.getUserInfo(user1.address);
    expect(userTickets3).to.equal(233);  // (1500 + 500 + 333) // 10
    expect(tier3).to.equal(Tier.Merchant);
    expect(stake3).to.equal(test1AmountToStake.add(test2AmountToStake).add(test3AmountToStake));
  });

  it("Test stakers filtering by tier", async () => {
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

    const queriedFans = await staking.getStakersByTier(Tier.Fan);
    expect(queriedFans.length).to.equal(1);
    expect(queriedFans[0]).to.equal(user2.address);

    const queriedMerchants = await staking.getStakersByTier(Tier.Merchant);
    expect(queriedMerchants.length).to.equal(2);
    expect(queriedMerchants[0]).to.equal(user3.address);
    expect(queriedMerchants[1]).to.equal(user4.address);
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

  it("Check zero pending reward in non-zero pools", async () => {
    const pendingReward = await staking.getPendingReward(0, user1.address);
    expect(pendingReward.eq(0)).to.be.true;
  });
});
