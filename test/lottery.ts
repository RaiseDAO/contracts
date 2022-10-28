import { BigNumber } from "ethers";
import { LotteryManager, Tier } from "../tasks/lottery";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";

describe("Lottery tests", function () {
  let user1: SignerWithAddress;
  let users: SignerWithAddress[];
  
  this.beforeEach(async () => {
    [user1, ...users] = await ethers.getSigners();
  })

  it("If there is only one user, lottery will choose him", async function () {
    const lottery = new LotteryManager();
    const userAllocationBonus = 10;

    for (let attemptNum = 0; attemptNum < 1000; attemptNum++) {

      for (const tier of [Tier.Fan, Tier.Broker, Tier.Dealer, Tier.Merchant, Tier.Tycoon]) {
        const lotteryResult = lottery.playLottery(tier, 10, [{
          user: user1.address,
          tickets: BigNumber.from(10),
          stakedAt: BigNumber.from(0),
          allocationBonusPercent: userAllocationBonus,
          tier: tier
        }]);
        expect(lotteryResult.whitelist.length).to.equal(1);
        expect(lotteryResult.allocationBonuses.length).to.equal(1);

        expect(lotteryResult.whitelist[0]).to.equal(user1.address);
        expect(lotteryResult.allocationBonuses[0]).to.equal(userAllocationBonus);
      }
    }
  });

  it("If we want to choose ten users out of ten, all the users will be choosen", async function () {
    const lottery = new LotteryManager();
    const userAllocationBonus = 10;

    for (let attemptNum = 0; attemptNum < 1000; attemptNum++) {
      for (const tier of [Tier.Fan, Tier.Broker, Tier.Dealer, Tier.Merchant, Tier.Tycoon]) {
        const lotteryResult = lottery.playLottery(tier, 10, users.slice(0, 10).map(user => ({
          user: user.address,
          tickets: BigNumber.from(10),
          stakedAt: BigNumber.from(0),
          allocationBonusPercent: userAllocationBonus,
          tier: tier
        })));
        expect(lotteryResult.whitelist.length).to.equal(10);
        expect(lotteryResult.allocationBonuses.length).to.equal(10);
      }
    }
  });

  it("If we want to choose 5 users out of 15, only 5 will be choosen for fan, merchant and dealer tiers with no duplicates", async function () {
    const lottery = new LotteryManager();
    const userAllocationBonus = 10;

    for (let attemptNum = 0; attemptNum < 1000; attemptNum++) {
      for (const tier of [Tier.Fan, Tier.Merchant, Tier.Dealer]) {
        const lotteryResult = lottery.playLottery(tier, 5, users.slice(0, 15).map(user => ({
          user: user.address,
          tickets: BigNumber.from(10),
          stakedAt: BigNumber.from(0),
          allocationBonusPercent: userAllocationBonus,
          tier: tier
        })));
        expect(lotteryResult.whitelist.length).to.equal(5);
        expect(lotteryResult.allocationBonuses.length).to.equal(5);
        expect(lotteryResult.whitelist.some((element, index) => { return lotteryResult.whitelist.indexOf(element) !== index })).to.be.false;
      }
    }
  });

  it("If we want to choose 5 users out of 15, statistical distribution will be correct", async function () {
    const lottery = new LotteryManager();
    const userAllocationBonus = 10;
    const attemptsNum = 1000;
    const itemsToChoose = 5;

    const totalPoints = attemptsNum * itemsToChoose;

    const registeredUsers = users.slice(0, 15);
    const tickets = registeredUsers.map((x, i) => (i + 1) * 10);

    const usersRolled: any = {};

    for (let attemptNum = 0; attemptNum < attemptsNum; attemptNum++) {
      for (const tier of [Tier.Merchant]) {
        const lotteryResult = lottery.playLottery(tier, itemsToChoose, registeredUsers.map((user, i) => ({
          user: user.address,
          tickets: BigNumber.from(tickets[i]),
          stakedAt: BigNumber.from(0),
          allocationBonusPercent: userAllocationBonus,
          tier: tier
        })));

        expect(lotteryResult.whitelist.length).to.equal(itemsToChoose);

        for (const choosenUser of lotteryResult.whitelist) {
          if (!usersRolled[choosenUser])
            usersRolled[choosenUser] = 1;
          else
            usersRolled[choosenUser] += 1;
        }
      }
    }

    const totalTickets = tickets.reduce((a, b) => a + b, 0);
    registeredUsers.map((registeredUser, i) => {
      expect(Math.abs(usersRolled[registeredUser.address] * 100 / totalPoints - tickets[i] * 100 / totalTickets) < 1.5);  // Deviation is less than 1.5%
    })
  });
})