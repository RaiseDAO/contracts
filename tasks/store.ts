import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { task, types } from "hardhat/config";


task("createStore", "Creates store")
    .addParam("raiseStoreAddr", "Address of the deployed staking contract")
    .setAction(async (args, hre) => {
        const store = await hre.ethers.getContractAt("RaiseStore", args['raiseStoreAddr']);
        const tx = await store.createStore(true, true);

        console.log(tx);
        const rc = await tx.wait();
        console.log(rc)
        console.log(rc.events)

    });