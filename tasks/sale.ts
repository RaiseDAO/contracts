import { ethers } from "ethers";
import { keccak256, parseEther, parseUnits, solidityPack } from "ethers/lib/utils";
import { task, types } from "hardhat/config";
import MerkleTree from "merkletreejs";

enum SaleType {
  ERC20 = 0,
  ERC1155 = 1,
}

task("createSale", "Creates new round")
  .addParam("factoryAddr", "Address of the deployed factory contract")
  .addParam("saleOwner", "Address of the sale owner")
  .addParam(
    "saleType",
    "Type of the sale. 0 - ERC20, 1 - ERC1155",
    2,
    types.int
  )
  .addParam("payTokenAddr", "Address of the pay token")
  .addParam("projectTokenAddr", "Address of the project token")
  .addParam("projectTokenDecimals", "Project token decimals")
  .addParam(
    "minimumAmountToFund",
    "Minium amount for sale owner to fund. In tokens to sell"
  )
  .addParam(
    "isWithdrawVestingEnabled",
    "Is withdraw vesting enabled for sale owner"
  )
  .addParam(
    "serviceFeePercent",
    "Is withdraw vesting enabled for sale owner",
    10,
    types.int
  )

  .setAction(async (args, hre) => {
    const factory = await hre.ethers.getContractAt(
      "SaleFactory",
      args["factoryAddr"]
    );

    const tx = await factory.createSale(
      args["saleOwner"],
      args["saleType"],
      args["payTokenAddr"],
      args["projectTokenAddr"],
      args["projectTokenDecimals"],
      parseEther(args["minimumAmountToFund"]),
      args["isWithdrawVestingEnabled"],
      args["serviceFeePercent"]
    );

    console.log(tx);
    const rc = await tx.wait();
    console.log(rc);

    console.log(
      `Sale created. Address: ${rc.events?.find((x) => x.event == "SaleCreated")?.args![0]
      }`
    );
  });

task("fundSale", "Funds sale with tokens")
  .addParam("saleAddr", "Address of the deployed sale contract")
  .addParam("tokenAddr", "Sale Token Address")
  .addParam("tokenAmount", "Sale Token Amount")

  .setAction(async (args, hre) => {
    const sale = await hre.ethers.getContractAt("SaleERC20", args["saleAddr"]);
    const payToken = await hre.ethers.getContractAt(
      "FakeToken1",
      args["tokenAddr"]
    );
    const amount = parseEther(args["tokenAmount"]);
    await payToken.approve(args["saleAddr"], amount);
    console.log('Approbed')
    const tx = await sale.fund(amount);
    console.log(tx);
    console.log(await tx.wait());
  });



task("createRound", "Creates new round")
  .addParam("saleAddr", "Address of the deployed sale contract")
  .addParam("requiredTier", "Tier required", 2, types.int)
  .addParam("maxAllocation", "Max allocation in project tokens", "100000")
  .addParam(
    "maxAllocationPerUser",
    "Max allocation per user  in project tokens",
    "8000"
  )
  .addParam("periodSeconds", "Round time duration is seconds", 10000, types.int)
  .addParam(
    "tokenPrice",
    "Token price in payment tokens in bignumber (100000 -> 0.1)",
    "100000"
  )
  .addParam("isFinal", "Is round final", false, types.boolean)
  .addParam(
    "whitelist",
    "List of addresses separated by comma to whitelist",
    ""
  )
  .addParam(
    "allocationBonuses",
    "List of corresponding allocation bonuses for whitelist",
    ""
  )
  .setAction(async (args, hre) => {
    let allocationBonuses = args["allocationBonuses"].split(",");
    let whitelist = (args["whitelist"].split(",")).map((x: string, i: number) => [x, allocationBonuses[i]]);

    let leaves = whitelist.map((info: any[]) => keccak256(solidityPack(["address", "uint8"], [info[0], info[1]])));
    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    let rootHash = "0x" + merkleTree.getRoot().toString('hex');

    const sale = await hre.ethers.getContractAt("SaleERC20", args["saleAddr"]);
    const tx = await sale.createRound(
      args["requiredTier"],
      parseEther(args["maxAllocation"]),
      parseEther(args["maxAllocationPerUser"]),
      args["periodSeconds"],
      args["tokenPrice"],
      args["isFinal"],
      rootHash
    );

    console.log(tx);
    console.log(await tx.wait());
  });

task("setVesting", "Setting vesting schedule")
  .addParam("saleAddr", "Address of the deployed sale contract")
  .addParam("vestingTimestamps", "Timestamps of vesting", "")
  .addParam("vestingPercents", "Vesting percents", "")
  .setAction(async (args, hre) => {
    const sale = await hre.ethers.getContractAt("SaleERC20", args["saleAddr"]);
    const tx = await sale.setVestingSchedule(
      args["vestingTimestamps"].split(","),
      args["vestingPercents"].split(",")
    );

    console.log(tx);
    console.log(await tx.wait());
  });


task("buy", "Creates new round")
  .addParam("saleAddr", "Address of the deployed sale contract")
  .addParam("payTokenAmount", "Pay token amount", "0.1", types.string)
  .addParam("payTokenAddr", "Address of the pay token")

  .addParam(
    "whitelist",
    "List of addresses separated by comma to whitelist",
    ""
  )
  .addParam(
    "allocationBonuses",
    "List of corresponding allocation bonuses for whitelist",
    ""
  )
  .setAction(async (args, hre) => {
    let allocationBonuses = args["allocationBonuses"].split(",");
    let whiltlistAddresses = args["whitelist"].split(",");

    const [account] = await hre.ethers.getSigners();

    let leaves = whiltlistAddresses.map((whitelistAddress: any, i: number) => keccak256(solidityPack(["address", "uint8"], [whitelistAddress, allocationBonuses[i]])));

    let merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });

    const leafIndex = whiltlistAddresses.indexOf(account.address);

    if (leafIndex === -1) {
      console.error("You're not whitelisted");
      return;
    }

    const proof = merkleTree.getHexProof(leaves[leafIndex]);
    const sale = await hre.ethers.getContractAt("SaleERC20", args["saleAddr"]);

    const payToken = await hre.ethers.getContractAt(
      "FakeToken1",
      args["payTokenAddr"]
    );

    const payTokenAmount = parseEther(args["payTokenAmount"]);
    await payToken.approve(args["saleAddr"], payTokenAmount);

    const tx = await sale.buy(
      payTokenAmount,
      allocationBonuses[leafIndex],
      proof
    );

    console.log(tx);
    console.log(await tx.wait());
  });



task("stopRound", "Stop ongoing round")
  .addParam("saleAddr", "Address of the deployed sale contract")
  .setAction(async (args, hre) => {
    const sale = await hre.ethers.getContractAt("SaleERC20", args["saleAddr"]);
    const round = await sale.getOngoingRound();
    const tx = await sale.stopRound(round.id);
    console.log(tx);
    console.log(await tx.wait());
  });


task("balanceOf", "Creates new round")
  .addParam("tokenAddr", "")
  .addParam("userAddr", "")
  .setAction(async (args, hre) => {
    const token = await hre.ethers.getContractAt(
      "RaiseToken",
      args["tokenAddr"]
    );
    console.log(await token.balanceOf(args["userAddr"]));
  });