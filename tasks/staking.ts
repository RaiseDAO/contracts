import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { task, types } from "hardhat/config";

enum Tier {
    None = 0,
    Fan = 1,
    Merchant = 2,
    Dealer = 3,
    Broker = 4,
    Tycoon = 5
}

task("changeStakingOwnerAddr", "Changes staking owner address")
    .addParam("stakingAddr", "Address of the deployed staking contract")
    .addParam("newOwnerAddr", "Address of user to grand permissions")
    .setAction(async (args, hre) => {
        const staking = await hre.ethers.getContractAt("Staking", args['stakingAddr']);
        const tx = await staking.transferOwnership(args['newOwnerAddr']);

        console.log(tx);
        console.log(await tx.wait());
    });

task("stake", "Stake")
    .addParam("stakingAddr", "Address of the deployed staking contract")
    .addParam("tokenAddr", "Address of the token", "0x340ef5D99E792aa66f7B3c277e90629C7D4C73B4")
    .addParam("poolId", "Pool id", 0, types.int)
    .addParam("stakingTime", "Staking time variant", 0, types.int)
    .addParam("amount", "Amount", "1.0")
    .setAction(async (args, hre) => {
        const token = await hre.ethers.getContractAt("RaiseToken", args['tokenAddr']);

        await token.approve(args['stakingAddr'], hre.ethers.utils.parseEther(args["amount"]))

        const staking = await hre.ethers.getContractAt("Staking", args['stakingAddr']);
        const tx = await staking.stake(args['poolId'], hre.ethers.utils.parseEther(args["amount"]), args['stakingTime']);

        console.log(tx);
        console.log(await tx.wait());
    });


task("transferToken")
    .addParam("tokenAddr", "Address of token", "0x340ef5D99E792aa66f7B3c277e90629C7D4C73B4")
    .addParam("toAddr", "Address of user to send token", "0x3f2E81982a62Aa9E69D6DE7E8ad9857cdf15e8fE")
    .setAction(async (args, hre) => {
        const raiseToken = await hre.ethers.getContractAt("RaiseToken", args['tokenAddr']);
        const tx = await raiseToken.transfer(args['toAddr'], hre.ethers.utils.parseEther("0.1"));
        const rc = await tx.wait();
        console.log(rc);
        console.log(rc.transactionHash);
    })

task("fund", "Fund service")
    .addParam("stakingAddr", "Address of the deployed staking contract", "0x340ef5D99E792aa66f7B3c277e90629C7D4C73B4")
    .addParam("tokenAddr", "Address of the token", "0x790c8945225bbf7340d50c89b3F2a0CF95B3eA83")
    .addParam("amount", "Amount", "10000000.0")
    .setAction(async (args, hre) => {
        const raiseAmount = hre.ethers.utils.parseEther(args['amount']);
        const raiseToken = await hre.ethers.getContractAt("RaiseToken", args['tokenAddr']);

        const [owner] = await hre.ethers.getSigners();


        await raiseToken.mint(owner.address, raiseAmount);


        await raiseToken.approve(args['stakingAddr'], raiseAmount);

        const staking = await hre.ethers.getContractAt("Staking", args['stakingAddr']);
        const tx = await staking.fund(raiseAmount);

        console.log(tx);
        console.log(await tx.wait());

        console.log(await staking.serviceBalance())
    });


task("checkTokenBalance")
    .addParam("tokenAddr", "Address of token", "0x340ef5D99E792aa66f7B3c277e90629C7D4C73B4")
    .addParam("toAddr", "Address of user to send token", "0x838aec1c2565a5D660BB7F0C540d2632A40B0d5b")
    .setAction(async (args, hre) => {
        const raiseToken = await hre.ethers.getContractAt("RaiseToken", args['tokenAddr']);
        console.log(await raiseToken.balanceOf(args['toAddr']));
    })

task("getRewardPerBlock", "Get reward per block")
    .addParam("stakingAddr", "Address of the deployed staking contract", "0x556b26Afad1926856ff436d3E95B5D210FCbFFE1")
    .setAction(async (args, hre) => {
        const staking = await hre.ethers.getContractAt("Staking", args['stakingAddr']);
        console.log(await staking.raisePerBlock())
    });


task("getBlockNumber", "Checks block passed per minute")
    .setAction(async (args, hre) => {
        console.log(await hre.ethers.provider.getBlockNumber())
        await new Promise(r => setTimeout(r, 20 * 60_000));
        console.log(await hre.ethers.provider.getBlockNumber())
    });


task("setRaisePerBlock", "Set reward per block")
    .addParam("stakingAddr", "Address of the deployed staking contract", "0x556b26Afad1926856ff436d3E95B5D210FCbFFE1")
    .addParam("raisePerBlock", "Amount of raise to distribute per block", "1.0")
    .setAction(async (args, hre) => {
        const staking = await hre.ethers.getContractAt("Staking", args['stakingAddr']);
        console.log(await staking.setRaisePerBlock(hre.ethers.utils.parseEther(args['raisePerBlock'])))
    });

task("getServiceBalance", "Get balance of the service")
    .addParam("stakingAddr", "Address of the deployed staking contract", "0x556b26Afad1926856ff436d3E95B5D210FCbFFE1")
    .setAction(async (args, hre) => {
        const staking = await hre.ethers.getContractAt("Staking", args['stakingAddr']);
        console.log(await staking.serviceBalance());
    });


task("checkTokenOwner")
    .addParam("tokenAddr", "Address of token", "0x340ef5D99E792aa66f7B3c277e90629C7D4C73B4")
    .setAction(async (args, hre) => {
        const raiseToken = await hre.ethers.getContractAt("RaiseToken", args['tokenAddr']);
        console.log(await raiseToken.owner());
    })

task("mintToken")
    .addParam("tokenAddr", "Address of token", "0x790c8945225bbf7340d50c89b3F2a0CF95B3eA83")
    .addParam("toAddr", "Address og user to mint", "0x838aec1c2565a5D660BB7F0C540d2632A40B0d5b")
    .addParam("amount", "Amount to mint", "10000000")
    .setAction(async (args, hre) => {
        const raiseToken = await hre.ethers.getContractAt("RaiseToken", args['tokenAddr']);
        const tx = await raiseToken.mint(args['toAddr'], parseEther(args['amount']));
        console.log(tx);
        console.log(await tx.wait());
    })

task("setRequiredStakeForTier", "Set required stake for tier")
    .addParam("stakingAddr", "Address of the deployed staking contract", "0x370985919C756677411114b054800D4D6Cb9B01b")
    .addParam("tier", "Tier to change", Tier.Tycoon, types.int)
    .addParam("requiredStake", "Required amount to stake", "100000")
    .setAction(async (args, hre) => {
        const staking = await hre.ethers.getContractAt("Staking", args['stakingAddr']);
        const tx = await staking.setRequiredStakeForTier(args['tier'], BigNumber.from(args['requiredStake']));

        console.log(tx);
        console.log(await tx.wait());
    });


task("getUserInfo", "Get user info")
    .addParam("stakingAddr", "Address of the deployed staking contract", "0x370985919C756677411114b054800D4D6Cb9B01b")
    .addParam("userAddr", "Address of user", "0x838aec1c2565a5D660BB7F0C540d2632A40B0d5b")
    .setAction(async (args, hre) => {
        const staking = await hre.ethers.getContractAt("Staking", args['stakingAddr']);
        const tx = await staking.getUserInfo(args['userAddr']);

        console.log(tx);
    });
