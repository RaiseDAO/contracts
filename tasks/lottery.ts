import { BigNumber } from "ethers";
import { randomBytes } from "ethers/lib/utils";
import { task, types } from "hardhat/config";

export enum Tier {
  None = 0,
  Fan = 1,
  Merchant = 2,
  Dealer = 3,
  Broker = 4,
  Tycoon = 5
}

export interface StakerInfo {
  tickets: BigNumber;
  stakedAt: BigNumber;
  user: string;
  allocationBonusPercent: number;
  tier: number;
}

export interface LotteryResult {
  whitelist: string[]
  allocationBonuses: number[]
}

export class LotteryManager {
  tiersToWhitelist: Tier[] = [];
  tiersToPlayTheLottery: Tier[] = [];

  constructor(tiersToWhitelist: Tier[] = [Tier.Broker, Tier.Tycoon], tiersToPlayTheLottery: Tier[] = [Tier.Fan, Tier.Dealer, Tier.Merchant]) {
    this.tiersToWhitelist = tiersToWhitelist;
    this.tiersToPlayTheLottery = tiersToPlayTheLottery;
  }

  playLottery(tier: Tier, usersToChooseNum: number, stakersInfo: StakerInfo[]): LotteryResult {
    let whitelist: string[] = [];
    let allocationBonuses: number[] = [];

    if (this.tiersToPlayTheLottery.includes(tier)) {

      const originalStakersInfo = stakersInfo;
      stakersInfo = stakersInfo.filter(x => x.tier === tier);

      if (originalStakersInfo.length != stakersInfo.length) {
        console.log("Warning, contract returned different tier for users", stakersInfo.filter(x => x.tier === tier));
      }

      for (let userToChooseIndex = 0; userToChooseIndex < usersToChooseNum; userToChooseIndex++) {
        const cumulativeTickets: BigNumber[] = [];

        for (let i = 0; i < stakersInfo.length; i++) {
          cumulativeTickets.push(stakersInfo[i].tickets.add(cumulativeTickets[i - 1] || BigNumber.from(0)))
        }

        const ticketsNum = cumulativeTickets[cumulativeTickets.length - 1];

        if (stakersInfo.length == 0) {
          break
        }

        const randomNumber = BigNumber.from(randomBytes(32)).mod(ticketsNum);
        for (let i = 0; i < stakersInfo.length; i++) {
          if (cumulativeTickets[i].gte(randomNumber)) {
            whitelist.push(stakersInfo[i].user);
            allocationBonuses.push(stakersInfo[i].allocationBonusPercent);
            stakersInfo.splice(i, 1);
            break;
          }
        }
      }
    } else if (this.tiersToWhitelist.includes(tier)) {
      whitelist = stakersInfo.map(x => x.user);
      allocationBonuses = stakersInfo.map(x => x.allocationBonusPercent);
    }

    return {
      whitelist: whitelist,
      allocationBonuses: allocationBonuses
    }
  }
}

task("lottery", "Start the lottery")
  .addParam("stakingAddr", "Address of the deployed staking contract", "0x556b26Afad1926856ff436d3E95B5D210FCbFFE1")
  .addParam("tier", "Required tier for lottery", Tier.Tycoon, types.int)
  .addParam("usersToChooseNum", "Number of users to choose, if rank is merchant or dealer", 10, types.int)
  .addParam("registeredUsers", "List of comma separated addresses registered for the round")
  .setAction(async (args, hre) => {
    const tier = args['tier'];
    const staking = await hre.ethers.getContractAt("Staking", args['stakingAddr']);
    const registeredUsers = args['registeredUsers'].split(',');
    const usersToChooseNum = args["usersToChooseNum"];
    const queriedStakers = await staking.getStakerLotteryInfos(registeredUsers);

    const lottery = new LotteryManager();

    const lotteryResult = lottery.playLottery(tier, usersToChooseNum, queriedStakers);
    console.log(`Whitelist: ${lotteryResult.whitelist}, allocation bonus percents: ${lotteryResult.allocationBonuses}`);
  });