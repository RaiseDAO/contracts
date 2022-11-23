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

task("whitelistStoreToken", "Whitelist token in the store")
    .addParam("raiseStoreAddr", "Address of the deployed staking contract")
    .setAction(async (args, hre) => {
        const store = await hre.ethers.getContractAt("RaiseStore", args['raiseStoreAddr']);
        const tx = await store.createStore(true, true);

        console.log(tx);
        const rc = await tx.wait();
        console.log(rc)
        console.log(rc.events)

    });

task("testBuyInStore", "Buy a product in a store")
    .addParam("raiseStoreAddr", "Address of the deployed staking contract")
    .setAction(async (args, hre) => {

        const store = await hre.ethers.getContractAt("RaiseStore", args['raiseStoreAddr']);
        const tx = await store.buy({
            storeId: 0,
            sellerAddr: "0x2836eC28C32E232280F984d3980BA4e05d6BF68f",
            userId: "0x0275962f",
            items: [{
                "collectionId": 0,
                "productId": "0xf892654d3e99486fa2f6b5180e70bab4",
                "payToken": "0xba0f3AcB3640E723Cbb3AeB644541fd0D3568a1b",
                "price": "0x52b7d2dcc80cd2e4000000",
                "amount": 1,
                "additionalInfo": "0x0000000000000000000000000000000000000000000000000000000000000000"
            }]
        });
        console.log(tx);
    });