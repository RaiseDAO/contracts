import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FakeToken1, RaiseStore, RaiseToken, Staking } from "../typechain";

let raiseToken: RaiseToken;
let fakeToken1: FakeToken1;

let store: RaiseStore;

let owner: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let user4: SignerWithAddress;
let user5: SignerWithAddress;
let user6: SignerWithAddress;

const FIRST_STORE_ID = 0;

describe("Store", function () {
  this.beforeEach(async () => {
    const RaiseToken = await ethers.getContractFactory("RaiseToken");
    raiseToken = await RaiseToken.deploy();

    const FakeToken1 = await ethers.getContractFactory("FakeToken1");
    fakeToken1 = await FakeToken1.deploy();

    const Store = await ethers.getContractFactory("RaiseStore");
    store = await Store.deploy(10);
    await store.deployed();
    
    [owner, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();
  });

  it("Check unable to buy if store is not exists", async function () {    
    await expect(store.buy({
        storeId: 0,
        sellerAddr: "0x2836eC28C32E232280F984d3980BA4e05d6BF68f",
        userId: "0x0275962f",
        items: []
    })).to.be.revertedWith("No such store");
  });

  it("Check unable to buy if token is not whitelisted", async function () {    
    const tx = await store.createStore(true, true);
    const rc = await tx.wait();
    const storeCreatedEvent = rc.events?.find(x => x.event == "StoreCreated");

    expect(storeCreatedEvent?.args!.storeId).to.equal(FIRST_STORE_ID);
    await store.buy({
        storeId: FIRST_STORE_ID,
        sellerAddr: "0x2836eC28C32E232280F984d3980BA4e05d6BF68f",
        userId: "0x0275962f",
        items: []
    });
  });
})