import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import assert from "assert";
import { ethers } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { utils, Wallet } from "zksync-web3";

async function deployOnAnyNetwork(hre: HardhatRuntimeEnvironment, contractName: string, constuctorArgs: any[] = []): Promise<ethers.Contract> {
    let contract: ethers.Contract;

    if (hre.network.name.toLowerCase().includes('zk')) {
        assert(process.env.ZK == '1', "It seems that you use zkSync network. Please set env variable ZK to 1")
    }

    if (process.env.ZK == '1') {
        await hre.run("compile");

        const wallet = new Wallet(process.env.PRIVATE_KEY!);
        const deployer = new Deployer(hre, wallet);
        const artifact = await deployer.loadArtifact(contractName);

        contract = await deployer.deploy(artifact, constuctorArgs);
        console.log("Verification arguments", contract.interface.encodeDeploy(constuctorArgs));

    } else {
        const Factory = await hre.ethers.getContractFactory(contractName);
        contract = await Factory.deploy(...constuctorArgs);
        contract.deployed();
        try {
            await hre.run("verify:verify", {
                address: contract.address,
                constructorArguments: constuctorArgs,
            });
        } catch (e) {
            console.log(e);
        }
    }
    return contract;
}

task("deployToken", "Deploys test token")
    .setAction(async (args, hre) => {
        const tokenContract = await deployOnAnyNetwork(hre, "RaiseToken");

        const mintTx1 = await tokenContract.mint("0x2836eC28C32E232280F984d3980BA4e05d6BF68f", ethers.utils.parseEther("1000000"));
        await mintTx1.wait();

        const mintTx2 = await tokenContract.mint("0x838aec1c2565a5D660BB7F0C540d2632A40B0d5b", ethers.utils.parseEther("1000000"));
        await mintTx2.wait();
        console.log(`RaiseToken was deployed to ${tokenContract.address}`);
    });


task("deployUSDC", "Deploys usdc token ")
    .setAction(async (args, hre) => {
        const tokenContract = await deployOnAnyNetwork(hre, "FakeTokenUSDC");

        const mintTx1 = await tokenContract.mint("0x2836eC28C32E232280F984d3980BA4e05d6BF68f", ethers.utils.parseUnits("1000000", 6));
        await mintTx1.wait();

        const mintTx = await tokenContract.mint("0x838aec1c2565a5D660BB7F0C540d2632A40B0d5b", ethers.utils.parseUnits("1000000", 6));
        await mintTx.wait();

        const mintTx2 = await tokenContract.mint("0xf6A501701D3ED860FfADF3FC055179b4600680F5", ethers.utils.parseUnits("1000000", 6));
        await mintTx2.wait();

        console.log(`FakeTokenUSDC was deployed to ${tokenContract.address}`);
    });

task("deployUSDT", "Deploys usdt token ")
    .setAction(async (args, hre) => {
        const tokenContract = await deployOnAnyNetwork(hre, "FakeTokenUSDT");

        const mintTx1 = await tokenContract.mint("0x2836eC28C32E232280F984d3980BA4e05d6BF68f", ethers.utils.parseUnits("1000000", 6));
        await mintTx1.wait();

        const mintTx = await tokenContract.mint("0x838aec1c2565a5D660BB7F0C540d2632A40B0d5b", ethers.utils.parseUnits("1000000", 6));
        await mintTx.wait();

        const mintTx2 = await tokenContract.mint("0xf6A501701D3ED860FfADF3FC055179b4600680F5", ethers.utils.parseUnits("1000000", 6));
        await mintTx2.wait();

        console.log(`FakeTokenUSDT was deployed to ${tokenContract.address}`);
    });

task("deployDAI", "Deploys dai token")
    .setAction(async (args, hre) => {
        const tokenContract = await deployOnAnyNetwork(hre, "FakeTokenDAI");

        const mintTx1 = await tokenContract.mint("0x2836eC28C32E232280F984d3980BA4e05d6BF68f", ethers.utils.parseEther("1000000"));
        await mintTx1.wait();

        const mintTx = await tokenContract.mint("0x838aec1c2565a5D660BB7F0C540d2632A40B0d5b", ethers.utils.parseEther("1000000"));
        await mintTx.wait();

        const mintTx2 = await tokenContract.mint("0xf6A501701D3ED860FfADF3FC055179b4600680F5", ethers.utils.parseEther("1000000"));
        await mintTx2.wait();

        console.log(`FakeTokenDAI was deployed to ${tokenContract.address}`);
    });


task("deployTRaise", "Deploys TRAISE token")
    .setAction(async (args, hre) => {
        const tokenContract = await deployOnAnyNetwork(hre, "FakeTRaise");

        const mintTx = await tokenContract.mint("0x838aec1c2565a5D660BB7F0C540d2632A40B0d5b", ethers.utils.parseEther("1000000"));
        await mintTx.wait();

        const mintTx2 = await tokenContract.mint("0xf6A501701D3ED860FfADF3FC055179b4600680F5", ethers.utils.parseEther("1000000"));
        await mintTx2.wait();

        console.log(`FakeTRaise was deployed to ${tokenContract.address}`);
    });


task("deployStaking", "Deploys staking contract on zksync network")
    .addParam("tokenAddr", "Address of the deployed token", "v")
    .addParam("raisePerBlock", "Raise per block", "1.0")
    .setAction(async (args, hre) => {
        const stakingContract = await deployOnAnyNetwork(hre, "Staking", [args['tokenAddr'], ethers.utils.parseEther(args['raisePerBlock'])]);
        console.log(`Staking was deployed to ${stakingContract.address}`);
    });

task("deployMulticall", "Deploys uniswap multicall")
    .setAction(async (args, hre) => {
        const multicallContract = await deployOnAnyNetwork(hre, "UniswapInterfaceMulticall");
        console.log(`Multical contract was deployed to ${multicallContract.address}`);
    });


task("deploySaleFactory", "Deploys uniswap multicall")
    .setAction(async (args, hre) => {
        const saleERC20 = await deployOnAnyNetwork(hre, "SaleERC20");
        //const saleERC1155 = await deployOnAnyNetwork(hre, "SaleERC1155");
        const saleFactoryContract = await deployOnAnyNetwork(hre, "SaleFactory", [saleERC20.address, "0x0000000000000000000000000000000000000000"]);
        console.log(`Sale factory deployed to: ${saleFactoryContract.address}\nSale ERC20 deployed to: ${saleERC20.address}\nSale ERC1155 deployed to: 0x0000000000000000000000000000000000000000`);
    });


task("deployRaiseStore", "Deploys raise store")
    .setAction(async (args, hre) => {
        const raiseStoreContract = await deployOnAnyNetwork(hre, "RaiseStore", [10]);
        console.log(`Raise store deployed to: ${raiseStoreContract.address}`);
    });

task("deployPaymaster", "Deploys raise paymaster on zksync network")
    .addParam("tokenAddr", "Address of the deployed token", "v")
    .addParam("ethToSupply", "Eth amount to send to paymaster", "0.05")
    .setAction(async (args, hre) => {
        const [owner] = await hre.ethers.getSigners();

        const raisePaymaster = await deployOnAnyNetwork(hre, "RaisePaymaster", [args['tokenAddr']]);
        console.log(`Paymaster was deployed to ${raisePaymaster.address}`);
        await owner.sendTransaction({to: raisePaymaster.address, value: parseEther(args['ethToSupply'])})
    });
