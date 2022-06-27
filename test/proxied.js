const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const { ethers, waffle } = require("hardhat");

describe("RaiseFinance launchpad tests:", async () => {
    let admin1, admin2, saleOwner1, saleOwner2, tycoon1, tycoon2, broker1, broker2, dealer1, dealer2, merchant1, merchant2, fan1, fan2
    let deployer
    let mMerklePoof, dMerkleProof
    // let zkProvider, ethProvider
    let admin, Admin
    let Token, raiseToken, paymentToken, saleToken1, saleToken2
    let rfSale, RFSale
    let rfSale1Proxy, rfSale2Proxy
    let rfSaleFactory, RFSaleFactory
    let rfAllocationStaking, RFAllocationStaking
    let rfProxy, RFProxy
    let rfSaleFactoryProxy
    let rfAllocationStakingProxy

    let merchantsTree, dealersTree
    let merchantRootHash, dealerRootHash

    let portionsOfTotalAmountOfTokensPerRound = [1400, 1900, 3000, 3700]
    let minBuyAmountInPaymentToken = [5000, 5000, 20000, 20000]
    let maxBuyAmountInPaymentToken = [20000, 20000, 50000, 50000]
    let fanMinBuyAmountInPaymentToken = 500
    let fanMaxBuyAmountInPaymentToken = 2000

    let numberOfRegistrants = 0
    let users
    let merchantsArray = []
    let dealersArray = []
    let brokersArray = []
    let tycoonsArray = []
    let fansArray = []
    let merchantsPoolIndexes = []
    let dealersPoolIndexes = []
    let brokersPoolIndexes = []
    let tycoonsPoolIndexes = []
    let merchantsTotalPurchases = 0
    let dealersTotalPurchases = 0
    let brokersTotalPurchases = 0
    let tycoonsTotalPurchases = 0
    let fansTotalPurchases = 0
    let totalPaid = 0
    let totalPurchases = 0
    let fanTierAmount = 200000
    let tokenPriceInPaymentToken = 0.5
    let sale1FundAmount = 1000000

    let newSignerIndex = 14

    const STAKING_REWARD_PER_SECOND = ethers.utils.parseUnits("0.1")
    const EARLY_UNSTAKING_FEE = 5000
    const secondsInADay = 24 * 60 * 60
    let TOKENS_PER_TICKET = 500

    let ADMINS, ADDRESSES_WITH_RAISE, ALL_ADDRESSES;

    let getTimestamp = async () => {
        let block = await ethers.provider.getBlock()
        return block.timestamp
    }

    function randomNumber(min, max) {
        let difference = max - min;
        let rand = Math.random();
        rand = Math.floor( rand * difference);
        rand = rand + min;
        return rand;
    }

    before(async () => {
        users = [...await ethers.getSigners()]

        admin1 = users[0]
        admin2 = users[1]
        saleOwner1 = users[2]
        saleOwner2 = users[3]
        tycoon1 = users[4]
        tycoon2 = users[5]
        broker1 = users[6]
        broker2 = users[7]
        dealer1 = users[8]
        dealer2 = users[9]
        merchant1 = users[10]
        merchant2 = users[11]
        fan1 = users[12]
        fan2 = users[13]
        
        ADMINS = [admin1.address, admin2.address]
        ALL_ADDRESSES = [
            admin1.address,
            admin2.address,
            saleOwner1.address,
            saleOwner2.address,
            tycoon1.address,
            tycoon2.address,
            broker1.address,
            broker2.address,
            dealer1.address,
            dealer2.address,
            merchant1.address,
            merchant2.address,
            fan1.address,
            fan2.address
        ]
        ADDRESSES_WITH_RAISE = [
            admin1.address,
            admin2.address,
            saleOwner1.address,
            saleOwner2.address,
            tycoon1.address,
            tycoon2.address,
            broker1.address,
            broker2.address,
            dealer1.address,
            dealer2.address,
            merchant1.address,
            merchant2.address,
            fan1.address,
            fan2.address
        ]

    })

    it("Deploying implementation and proxy contracts and attaching implementation's ABI to proxies:", async () => {
        Admin = await ethers.getContractFactory("Admin")
        admin = await Admin.deploy(ADMINS)
        await admin.deployed();

        RFSale = await ethers.getContractFactory("RFSale")
        rfSale = await RFSale.deploy()
        await rfSale.deployed();

        RFSaleFactory = await ethers.getContractFactory("RFSaleFactory")
        rfSaleFactory = await RFSaleFactory.deploy()
        await rfSaleFactory.deployed();

        RFAllocationStaking = await ethers.getContractFactory("RFAllocationStaking")
        rfAllocationStaking = await RFAllocationStaking.deploy()
        await rfAllocationStaking.deployed();

        Token = await ethers.getContractFactory("RFIToken");
        raiseToken = await Token.deploy("RAISE", "RAISE", admin1.address, ADDRESSES_WITH_RAISE)
        await raiseToken.deployed();
        paymentToken = await Token.deploy("USDC", "USDC", admin1.address, ALL_ADDRESSES)
        await paymentToken.deployed();
        saleToken1 = await Token.deploy("SALE1", "SALE1", saleOwner1.address, [saleOwner1.address])
        await saleToken1.deployed();
        saleToken2 = await Token.deploy("SALE2", "SALE2", saleOwner2.address, [saleOwner2.address])
        await saleToken2.deployed();

        RFProxy = await ethers.getContractFactory("RFProxy")

        let rfSaleFactoryProxyContract = await RFProxy.deploy(rfSaleFactory.address, [], admin.address) 
        await rfSaleFactoryProxyContract.deployed();
        // rfSaleFactoryProxy interface
        let rfSaleFactoryProxyInterface = rfSaleFactoryProxyContract.interface
        // rfSaleFactoryProxy ABI
        let rfSaleFactoryProxyABI = rfSaleFactoryProxyInterface.format(ethers.utils.FormatTypes.minimal)
        // rfSaleFactory interface
        let rfSaleFactoryInterface = rfSaleFactory.interface
        // rfSaleFactory ABI
        let rfSaleFactoryABI = rfSaleFactoryInterface.format(ethers.utils.FormatTypes.minimal)
        // rfSaleFactory and rfSaleFactoryProxy combined ABI array
        let rfSaleFactoryProxyCombinedABIArray = rfSaleFactoryABI.concat(rfSaleFactoryProxyABI)
        // rfSaleFactory and rfSaleFactoryProxy combined ABI JSON
        let rfSaleFactoryProxyCombinedABI = JSON.stringify(rfSaleFactoryProxyCombinedABIArray)
        rfSaleFactoryProxy = new ethers.Contract(rfSaleFactoryProxyContract.address, rfSaleFactoryProxyCombinedABI, admin1)

        let rfAllocationStakingProxyContract = await RFProxy.deploy(rfAllocationStaking.address, [], admin.address)
        await rfAllocationStakingProxyContract.deployed();
        // rfAllocationStakinProxy interface
        let rfAllocationStakingProxyInterface = rfAllocationStakingProxyContract.interface
        // rfAllocationStakingProxy ABI
        let rfAllocationStakingProxyABI = rfAllocationStakingProxyInterface.format(ethers.utils.FormatTypes.minimal)
        // rfAllocationStaking interface
        let rfAllocationStakingInterface = rfAllocationStaking.interface
        // rfAllocationStaking ABI
        let rfAllocationStakingABI = rfAllocationStakingInterface.format(ethers.utils.FormatTypes.minimal)
        // rfAllocationStaking and rfAllocationStakingProxy combined ABI array
        let rfAllocationStakingProxyCombinedABIArray = rfAllocationStakingABI.concat(rfAllocationStakingProxyABI)
        // rfAllocationStaking and rfAllocationStakingProxy combined ABI JSON
        let rfAllocationStakingProxyCombinedABI = JSON.stringify(rfAllocationStakingProxyCombinedABIArray)
        rfAllocationStakingProxy = new ethers.Contract(rfAllocationStakingProxyContract.address, rfAllocationStakingProxyCombinedABI, admin1)
    })

    it("Proxied call reaches implementation and initizlizes allocation staking and sale factory", async () => {
        let timestamp = await getTimestamp()

        await rfAllocationStakingProxy.initialize(
            raiseToken.address,
            STAKING_REWARD_PER_SECOND,
            timestamp + 60 * 60, // current timestamp + 1 hour
            50,
            rfSaleFactoryProxy.address,
            TOKENS_PER_TICKET,
            admin.address
        )

        expect(await rfAllocationStakingProxy.RAISE()).to.be.equal(raiseToken.address)
        expect(await rfAllocationStakingProxy.rewardPerSecond()).to.be.equal(STAKING_REWARD_PER_SECOND)
        expect(await rfAllocationStakingProxy.startTimestamp()).to.be.equal(timestamp + 60 * 60)
        expect(await rfAllocationStakingProxy.earlyUnstakingFee()).to.be.equal(50)
        expect(await rfAllocationStakingProxy.salesFactory()).to.be.equal(rfSaleFactoryProxy.address)
        expect(await rfAllocationStakingProxy.tokensPerTicket()).to.be.equal(TOKENS_PER_TICKET)
        expect(await rfAllocationStakingProxy.admin()).to.be.equal(admin.address)

        await rfSaleFactoryProxy.initialize(
            admin.address,
            rfAllocationStakingProxy.address,
            rfSale.address
        )

        expect(await rfSaleFactoryProxy.admin()).to.be.equal(admin.address)
        expect(await rfSaleFactoryProxy.allocationStaking()).to.be.equal(rfAllocationStakingProxy.address)
        expect(await rfSaleFactoryProxy.saleContractImplementation()).to.be.equal(rfSale.address)
    })

    it("Non admin addresses can not call onlyAdmin function", async () => {
        await expect(rfSaleFactoryProxy.connect(fan1).deploySale([])).to.be.revertedWith("Only Admin can deploy sales")
    })

    it("It should be able to change tokens per ticket", async () => {
        await rfAllocationStakingProxy.setTokensPerTicket(500)
        expect(await rfAllocationStakingProxy.tokensPerTicket()).to.be.equal(500)
    })

    it("It should be able to change early unstaking fee", async () => {
        await rfAllocationStakingProxy.setEarlyUnstakingFee(5000)
        expect(await rfAllocationStakingProxy.earlyUnstakingFee()).to.be.equal(5000)
    })

    it("It should be able to set sales factory", async () => {
        await rfAllocationStakingProxy.setSalesFactory(rfSaleFactoryProxy.address)
        expect(await rfAllocationStakingProxy.salesFactory()).to.be.equal(rfSaleFactoryProxy.address)
    })

    it("It should be able to get total pending", async () => {
        expect(await rfAllocationStakingProxy.totalPending()).to.be.equal(0)
    })

    it("Funds staking contract and sets everything properly.", async () => {
        // approving 10 000 000 tokens to staking contract
        await raiseToken.approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("10000000"))
        // funding staking contract with 5 000 000 tokens
        await rfAllocationStakingProxy.fund(ethers.utils.parseEther("5000000"))
        // checking that funds were added to staking contract
        
        expect(
            await raiseToken.balanceOf(rfAllocationStakingProxy.address)
        ).to.be.equal(ethers.utils.parseEther("5000000"))
        let curTimestamp = await getTimestamp()
        expect(
            await rfAllocationStakingProxy.endTimestamp()
        ).to.be.above(curTimestamp)
        expect(
            await rfAllocationStakingProxy.totalRewards()
        ).to.be.equal(ethers.utils.parseEther("5000000"))

        // funding staking contract with 5 000 000 tokens
        await rfAllocationStakingProxy.fund(ethers.utils.parseEther("5000000"))
        // checking that funds were added to staking contract
        
        expect(
            await raiseToken.balanceOf(rfAllocationStakingProxy.address)
        ).to.be.equal(ethers.utils.parseEther("10000000"))
        let curTimestamp2 = await getTimestamp()
        expect(
            await rfAllocationStakingProxy.endTimestamp()
        ).to.be.above(curTimestamp2)
        expect(
            await rfAllocationStakingProxy.totalRewards()
        ).to.be.equal(ethers.utils.parseEther("10000000"))
    })

    it("It should be able to change rewards per second", async () => {
        await rfAllocationStakingProxy.setRewardPerSecond(STAKING_REWARD_PER_SECOND)
        expect(await rfAllocationStakingProxy.rewardPerSecond()).to.be.equal(STAKING_REWARD_PER_SECOND)
    })

    it("Adds 4 pools for RAISE staking with 1, 3, 6, 12 months of min staking period and 2500, 3250, 4250, 6000 allocPoints", async () => {
        // adding 4 pools for RAISE staking with 1, 3, 6, 12 months of min staking period and each
        await rfAllocationStakingProxy.add(2500, raiseToken.address, 30 * secondsInADay, false);
        await rfAllocationStakingProxy.add(3250, raiseToken.address, 90 * secondsInADay, false);
        await rfAllocationStakingProxy.add(4250, raiseToken.address, 180 * secondsInADay, false);
        await rfAllocationStakingProxy.add(6000, raiseToken.address, 360 * secondsInADay, false);

        let poolInfo1 = await rfAllocationStakingProxy.poolInfo(0)
        let poolInfo2 = await rfAllocationStakingProxy.poolInfo(1)
        let poolInfo3 = await rfAllocationStakingProxy.poolInfo(2)
        let poolInfo4 = await rfAllocationStakingProxy.poolInfo(3)

        let stakingRewardStartTimestamp = await rfAllocationStakingProxy.startTimestamp()

        expect(poolInfo1[0]).to.be.equal(raiseToken.address)
        expect(poolInfo1[1]).to.be.equal(2500)
        expect(poolInfo1[2]).to.be.equal(stakingRewardStartTimestamp)
        expect(poolInfo1[3]).to.be.equal(0)
        expect(poolInfo1[4]).to.be.equal(0)
        expect(poolInfo1[5]).to.be.equal(30 * secondsInADay)

        expect(poolInfo2[0]).to.be.equal(raiseToken.address)
        expect(poolInfo2[1]).to.be.equal(3250)
        expect(poolInfo2[2]).to.be.equal(stakingRewardStartTimestamp)
        expect(poolInfo2[3]).to.be.equal(0)
        expect(poolInfo2[4]).to.be.equal(0)
        expect(poolInfo2[5]).to.be.equal(90 * secondsInADay)

        expect(poolInfo3[0]).to.be.equal(raiseToken.address)
        expect(poolInfo3[1]).to.be.equal(4250)
        expect(poolInfo3[2]).to.be.equal(stakingRewardStartTimestamp)
        expect(poolInfo3[3]).to.be.equal(0)
        expect(poolInfo3[4]).to.be.equal(0)
        expect(poolInfo3[5]).to.be.equal(180 * secondsInADay)

        expect(poolInfo4[0]).to.be.equal(raiseToken.address)
        expect(poolInfo4[1]).to.be.equal(6000)
        expect(poolInfo4[2]).to.be.equal(stakingRewardStartTimestamp)
        expect(poolInfo4[3]).to.be.equal(0)
        expect(poolInfo4[4]).to.be.equal(0)
        expect(poolInfo4[5]).to.be.equal(360 * secondsInADay)

        //checking that pool is saved in a mapping that stored raise pools 
        expect(await rfAllocationStakingProxy.isRAISEPool(0)).to.be.equal(true)
        expect(await rfAllocationStakingProxy.isRAISEPool(1)).to.be.equal(true)
        expect(await rfAllocationStakingProxy.isRAISEPool(2)).to.be.equal(true)
        expect(await rfAllocationStakingProxy.isRAISEPool(3)).to.be.equal(true)
    })

    it("Adding non RAISE pool with 4000 alloPoints", async () => {
        // adding a non RAISE pool with min staking period to make sure that it will not be used as min staking period applies only for raise tokens
        await rfAllocationStakingProxy.add(4000, paymentToken.address, 30 * secondsInADay, false);

        await paymentToken.connect(tycoon1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("10000000"))
        await rfAllocationStakingProxy.connect(tycoon1).deposit(4, ethers.utils.parseEther("10000"))

        let poolInfo = await rfAllocationStakingProxy.poolInfo(4)

        let stakingRewardStartTimestamp = await rfAllocationStakingProxy.startTimestamp()

        expect(await rfAllocationStakingProxy.isRAISEPool(4)).to.be.equal(false)

        expect(poolInfo[0]).to.be.equal(paymentToken.address)
        expect(poolInfo[1]).to.be.equal(4000)
        expect(poolInfo[2]).to.be.equal(stakingRewardStartTimestamp)
        expect(poolInfo[3]).to.be.equal(0)
        expect(poolInfo[4]).to.be.equal(ethers.utils.parseEther("10000"))
        expect(poolInfo[5]).to.be.equal(0)
    })

    it("Users should be able to stake. Afterward, info on their stakes, tiers and ticket amounts should be served accordingly", async () => {
        // tycoon1 stakes 100000 tokens to pool 0 with 1 month min staking period 
        await raiseToken.connect(tycoon1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("100000"))
        // tycoon1 stakes 25000 tokens to pool 0 with 1 month min staking period
        await rfAllocationStakingProxy.connect(tycoon1).deposit(0, ethers.utils.parseEther("25000"))
        // tycoon1 stakes 25000 tokens to pool 1 with 3 month min staking period
        await rfAllocationStakingProxy.connect(tycoon1).deposit(1, ethers.utils.parseEther("25000"))
        // tycoon1 stakes 25000 tokens to pool 2 with 6 month min staking period
        await rfAllocationStakingProxy.connect(tycoon1).deposit(2, ethers.utils.parseEther("25000"))
        // tycoon1 stakes 25000 tokens to pool 3 with 12 month min staking period
        await rfAllocationStakingProxy.connect(tycoon1).deposit(3, ethers.utils.parseEther("25000"))

        // tycoon2 stakes 100000 tokens to pool 0 with 1 month min staking period 
        await raiseToken.connect(tycoon2).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("100000"))
        // tycoon2 stakes 25000 tokens to pool 0 with 1 month min staking period
        await rfAllocationStakingProxy.connect(tycoon2).deposit(0, ethers.utils.parseEther("25000"))
        // tycoon2 stakes 25000 tokens to pool 1 with 3 month min staking period
        await rfAllocationStakingProxy.connect(tycoon2).deposit(1, ethers.utils.parseEther("25000"))
        // tycoon2 stakes 25000 tokens to pool 2 with 6 month min staking period
        await rfAllocationStakingProxy.connect(tycoon2).deposit(2, ethers.utils.parseEther("25000"))
        // tycoon2 stakes 25000 tokens to pool 3 with 12 month min staking period
        await rfAllocationStakingProxy.connect(tycoon2).deposit(3, ethers.utils.parseEther("25000"))

        // broker1 stakes 50000 tokens to pool 0 with 1 month min staking period 
        await raiseToken.connect(broker1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("50000"))
        // broker1 stakes 12500 tokens to pool 0 with 1 month min staking period
        await rfAllocationStakingProxy.connect(broker1).deposit(0, ethers.utils.parseEther("12500"))
        // broker1 stakes 12500 tokens to pool 1 with 3 month min staking period
        await rfAllocationStakingProxy.connect(broker1).deposit(1, ethers.utils.parseEther("12500"))
        // broker1 stakes 12500 tokens to pool 2 with 6 month min staking period
        await rfAllocationStakingProxy.connect(broker1).deposit(2, ethers.utils.parseEther("12500"))
        // broker1 stakes 12500 tokens to pool 3 with 12 month min staking period
        await rfAllocationStakingProxy.connect(broker1).deposit(3, ethers.utils.parseEther("12500"))

        // broker2 stakes 50000 tokens to pool 0 with 1 month min staking period 
        await raiseToken.connect(broker2).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("50000"))
        // broker2 stakes 12500 tokens to pool 0 with 1 month min staking period
        await rfAllocationStakingProxy.connect(broker2).deposit(0, ethers.utils.parseEther("12500"))
        // broker2 stakes 12500 tokens to pool 1 with 3 month min staking period
        await rfAllocationStakingProxy.connect(broker2).deposit(1, ethers.utils.parseEther("12500"))
        // broker2 stakes 12500 tokens to pool 2 with 6 month min staking period
        await rfAllocationStakingProxy.connect(broker2).deposit(2, ethers.utils.parseEther("12500"))
        // broker2 stakes 12500 tokens to pool 3 with 12 month min staking period
        await rfAllocationStakingProxy.connect(broker2).deposit(3, ethers.utils.parseEther("12500"))

        // dealer1 stakes 5000 tokens to pool 0 with 1 month min staking period 
        await raiseToken.connect(dealer1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("5000"))
        // dealer1 stakes 1250 tokens to pool 0 with 1 month min staking period
        await rfAllocationStakingProxy.connect(dealer1).deposit(0, ethers.utils.parseEther("1250"))
        // dealer1 stakes 1250 tokens to pool 1 with 3 month min staking period
        await rfAllocationStakingProxy.connect(dealer1).deposit(1, ethers.utils.parseEther("1250"))
        // dealer1 stakes 1250 tokens to pool 2 with 6 month min staking period
        await rfAllocationStakingProxy.connect(dealer1).deposit(2, ethers.utils.parseEther("1250"))
        // dealer1 stakes 1250 tokens to pool 3 with 12 month min staking period
        await rfAllocationStakingProxy.connect(dealer1).deposit(3, ethers.utils.parseEther("1250"))

        // dealer2 stakes 5000 tokens to pool 0 with 1 month min staking period 
        await raiseToken.connect(dealer2).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("5000"))
        // dealer2 stakes 1250 tokens to pool 0 with 1 month min staking period
        await rfAllocationStakingProxy.connect(dealer2).deposit(0, ethers.utils.parseEther("1250"))
        // dealer2 stakes 1250 tokens to pool 1 with 3 month min staking period
        await rfAllocationStakingProxy.connect(dealer2).deposit(1, ethers.utils.parseEther("1250"))
        // dealer2 stakes 1250 tokens to pool 2 with 6 month min staking period
        await rfAllocationStakingProxy.connect(dealer2).deposit(2, ethers.utils.parseEther("1250"))
        // dealer2 stakes 1250 tokens to pool 3 with 12 month min staking period
        await rfAllocationStakingProxy.connect(dealer2).deposit(3, ethers.utils.parseEther("1250"))

        // merchant1 stakes 500 tokens to pool 0 with 1 month min staking period 
        await raiseToken.connect(merchant1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("500"))
        // merchant1 stakes 125 tokens to pool 0 with 1 month min staking period
        await rfAllocationStakingProxy.connect(merchant1).deposit(0, ethers.utils.parseEther("125"))
        // merchant1 stakes 125 tokens to pool 1 with 3 month min staking period
        await rfAllocationStakingProxy.connect(merchant1).deposit(1, ethers.utils.parseEther("125"))
        // merchant1 stakes 125 tokens to pool 2 with 6 month min staking period
        await rfAllocationStakingProxy.connect(merchant1).deposit(2, ethers.utils.parseEther("125"))
        // merchant1 stakes 125 tokens to pool 3 with 12 month min staking period
        await rfAllocationStakingProxy.connect(merchant1).deposit(3, ethers.utils.parseEther("125"))

        // merchant2 stakes 500 tokens to pool 0 with 1 month min staking period 
        await raiseToken.connect(merchant2).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("500"))
        // merchant2 stakes 125 tokens to pool 0 with 1 month min staking period
        await rfAllocationStakingProxy.connect(merchant2).deposit(0, ethers.utils.parseEther("125"))
        // merchant2 stakes 125 tokens to pool 1 with 3 month min staking period
        await rfAllocationStakingProxy.connect(merchant2).deposit(1, ethers.utils.parseEther("125"))
        // merchant2 stakes 125 tokens to pool 2 with 6 month min staking period
        await rfAllocationStakingProxy.connect(merchant2).deposit(2, ethers.utils.parseEther("125"))
        // merchant2 stakes 125 tokens to pool 3 with 12 month min staking period
        await rfAllocationStakingProxy.connect(merchant2).deposit(3, ethers.utils.parseEther("125"))

        // fan1 stakes 250 tokens to pool 0 with 1 month min staking period 
        await raiseToken.connect(fan1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("250"))
        // fan1 stakes 75 tokens to pool 0 with 1 month min staking period
        await rfAllocationStakingProxy.connect(fan1).deposit(0, ethers.utils.parseEther("62.5"))
        // fan1 stakes 75 tokens to pool 1 with 3 month min staking period
        await rfAllocationStakingProxy.connect(fan1).deposit(1, ethers.utils.parseEther("62.5"))
        // fan1 stakes 75 tokens to pool 2 with 6 month min staking period
        await rfAllocationStakingProxy.connect(fan1).deposit(2, ethers.utils.parseEther("62.5"))
        // fan1 stakes 75 tokens to pool 3 with 12 month min staking period
        await rfAllocationStakingProxy.connect(fan1).deposit(3, ethers.utils.parseEther("62.5"))

        // fan2 stakes 250 tokens to pool 0 with 1 month min staking period 
        await raiseToken.connect(fan2).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("250"))
        // fan2 stakes 75 tokens to pool 0 with 1 month min staking period
        await rfAllocationStakingProxy.connect(fan2).deposit(0, ethers.utils.parseEther("62.5"))
        // fan2 stakes 75 tokens to pool 1 with 3 month min staking period
        await rfAllocationStakingProxy.connect(fan2).deposit(1, ethers.utils.parseEther("62.5"))
        // fan2 stakes 75 tokens to pool 2 with 6 month min staking period
        await rfAllocationStakingProxy.connect(fan2).deposit(2, ethers.utils.parseEther("62.5"))
        // fan2 stakes 75 tokens to pool 3 with 12 month min staking period
        await rfAllocationStakingProxy.connect(fan2).deposit(3, ethers.utils.parseEther("62.5"))

        // increse evm time to 30 days
        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 30]);
        await ethers.provider.send("evm_mine");

        await rfAllocationStakingProxy.massUpdatePools()

        expect(
            await rfAllocationStakingProxy.totalRAISEDeposited()
        ).to.be.equal(ethers.utils.parseEther("311500"))

        let poolInfo0 = await rfAllocationStakingProxy.poolInfo(0)
        let poolInfo1 = await rfAllocationStakingProxy.poolInfo(1)
        let poolInfo2 = await rfAllocationStakingProxy.poolInfo(2)
        let poolInfo3 = await rfAllocationStakingProxy.poolInfo(3)
        let poolInfo4 = await rfAllocationStakingProxy.poolInfo(4)
        expect(poolInfo0[4]).to.be.equal(ethers.utils.parseEther("77875"))
        expect(poolInfo1[4]).to.be.equal(ethers.utils.parseEther("77875"))
        expect(poolInfo2[4]).to.be.equal(ethers.utils.parseEther("77875"))
        expect(poolInfo3[4]).to.be.equal(ethers.utils.parseEther("77875"))
        expect(poolInfo4[4]).to.be.equal(ethers.utils.parseEther("10000"))

        // tycoon1 checks:
        expect(await rfAllocationStakingProxy.deposited(0, tycoon1.address)).to.equal(ethers.utils.parseEther("25000"))
        expect(await rfAllocationStakingProxy.deposited(1, tycoon1.address)).to.equal(ethers.utils.parseEther("25000"))
        expect(await rfAllocationStakingProxy.deposited(2, tycoon1.address)).to.equal(ethers.utils.parseEther("25000"))
        expect(await rfAllocationStakingProxy.deposited(3, tycoon1.address)).to.equal(ethers.utils.parseEther("25000"))
        expect(await rfAllocationStakingProxy.getCurrentTier(tycoon1.address)).to.equal(4)
        await expect(rfAllocationStakingProxy.getTicketAmount(tycoon1.address))
        .to.be.revertedWith("RF_SA: Brokers, Tycoons and Fans are not elligible for tickets")
        let pool0 = await rfAllocationStakingProxy.userInfo(0, tycoon1.address)
        let pool1 = await rfAllocationStakingProxy.userInfo(1, tycoon1.address)
        let pool2 = await rfAllocationStakingProxy.userInfo(2, tycoon1.address)
        let pool3 = await rfAllocationStakingProxy.userInfo(3, tycoon1.address)
        expect(pool0[2]).to.not.equal(0)
        expect(pool0[3]).to.not.equal(0)
        expect(pool1[2]).to.not.equal(0)
        expect(pool1[3]).to.not.equal(0)
        expect(pool2[2]).to.not.equal(0)
        expect(pool2[3]).to.not.equal(0)
        expect(pool3[2]).to.not.equal(0)
        expect(pool3[3]).to.not.equal(0)

        //tycoon2 checks:
        expect(await rfAllocationStakingProxy.deposited(0, tycoon2.address)).to.equal(ethers.utils.parseEther("25000"))
        expect(await rfAllocationStakingProxy.deposited(1, tycoon2.address)).to.equal(ethers.utils.parseEther("25000"))
        expect(await rfAllocationStakingProxy.deposited(2, tycoon2.address)).to.equal(ethers.utils.parseEther("25000"))
        expect(await rfAllocationStakingProxy.deposited(3, tycoon2.address)).to.equal(ethers.utils.parseEther("25000"))
        expect(await rfAllocationStakingProxy.getCurrentTier(tycoon2.address)).to.equal(4)
        await expect(rfAllocationStakingProxy.getTicketAmount(tycoon2.address))
        .to.be.revertedWith("RF_SA: Brokers, Tycoons and Fans are not elligible for tickets")
        pool0 = await rfAllocationStakingProxy.userInfo(0, tycoon2.address)
        pool1 = await rfAllocationStakingProxy.userInfo(1, tycoon2.address)
        pool2 = await rfAllocationStakingProxy.userInfo(2, tycoon2.address)
        pool3 = await rfAllocationStakingProxy.userInfo(3, tycoon2.address)
        expect(pool0[2]).to.not.equal(0)
        expect(pool0[3]).to.not.equal(0)
        expect(pool1[2]).to.not.equal(0)
        expect(pool1[3]).to.not.equal(0)
        expect(pool2[2]).to.not.equal(0)
        expect(pool2[3]).to.not.equal(0)
        expect(pool3[2]).to.not.equal(0)
        expect(pool3[3]).to.not.equal(0)

        // broker1 checks:
        expect(await rfAllocationStakingProxy.deposited(0, broker1.address)).to.equal(ethers.utils.parseEther("12500"))
        expect(await rfAllocationStakingProxy.deposited(1, broker1.address)).to.equal(ethers.utils.parseEther("12500"))
        expect(await rfAllocationStakingProxy.deposited(2, broker1.address)).to.equal(ethers.utils.parseEther("12500"))
        expect(await rfAllocationStakingProxy.deposited(3, broker1.address)).to.equal(ethers.utils.parseEther("12500"))
        expect(await rfAllocationStakingProxy.getCurrentTier(broker1.address)).to.equal(3)
        await expect(rfAllocationStakingProxy.getTicketAmount(broker1.address))
        .to.be.revertedWith("RF_SA: Brokers, Tycoons and Fans are not elligible for tickets")
        pool0 = await rfAllocationStakingProxy.userInfo(0, broker1.address)
        pool1 = await rfAllocationStakingProxy.userInfo(1, broker1.address)
        pool2 = await rfAllocationStakingProxy.userInfo(2, broker1.address)
        pool3 = await rfAllocationStakingProxy.userInfo(3, broker1.address)
        expect(pool0[2]).to.not.equal(0)
        expect(pool0[3]).to.not.equal(0)
        expect(pool1[2]).to.not.equal(0)
        expect(pool1[3]).to.not.equal(0)
        expect(pool2[2]).to.not.equal(0)
        expect(pool2[3]).to.not.equal(0)
        expect(pool3[2]).to.not.equal(0)
        expect(pool3[3]).to.not.equal(0)

        // broker2 checks:
        expect(await rfAllocationStakingProxy.deposited(0, broker2.address)).to.equal(ethers.utils.parseEther("12500"))
        expect(await rfAllocationStakingProxy.deposited(1, broker2.address)).to.equal(ethers.utils.parseEther("12500"))
        expect(await rfAllocationStakingProxy.deposited(2, broker2.address)).to.equal(ethers.utils.parseEther("12500"))
        expect(await rfAllocationStakingProxy.deposited(3, broker2.address)).to.equal(ethers.utils.parseEther("12500"))
        expect(await rfAllocationStakingProxy.getCurrentTier(broker2.address)).to.equal(3)
        await expect(rfAllocationStakingProxy.getTicketAmount(broker2.address))
        .to.be.revertedWith("RF_SA: Brokers, Tycoons and Fans are not elligible for tickets")
        pool0 = await rfAllocationStakingProxy.userInfo(0, broker2.address)
        pool1 = await rfAllocationStakingProxy.userInfo(1, broker2.address)
        pool2 = await rfAllocationStakingProxy.userInfo(2, broker2.address)
        pool3 = await rfAllocationStakingProxy.userInfo(3, broker2.address)
        expect(pool0[2]).to.not.equal(0)
        expect(pool0[3]).to.not.equal(0)
        expect(pool1[2]).to.not.equal(0)
        expect(pool1[3]).to.not.equal(0)
        expect(pool2[2]).to.not.equal(0)
        expect(pool2[3]).to.not.equal(0)
        expect(pool3[2]).to.not.equal(0)
        expect(pool3[3]).to.not.equal(0)

        // dealer1 checks:
        expect(await rfAllocationStakingProxy.deposited(0, dealer1.address)).to.equal(ethers.utils.parseEther("1250"))
        expect(await rfAllocationStakingProxy.deposited(1, dealer1.address)).to.equal(ethers.utils.parseEther("1250"))
        expect(await rfAllocationStakingProxy.deposited(2, dealer1.address)).to.equal(ethers.utils.parseEther("1250"))
        expect(await rfAllocationStakingProxy.deposited(3, dealer1.address)).to.equal(ethers.utils.parseEther("1250"))
        expect(await rfAllocationStakingProxy.getCurrentTier(dealer1.address)).to.equal(2)
        expect(await rfAllocationStakingProxy.getTicketAmount(dealer1.address))
        .to.equal(ethers.utils.parseEther("5000").div(BigNumber.from(TOKENS_PER_TICKET).mul(ethers.utils.parseEther("1"))))
        pool0 = await rfAllocationStakingProxy.userInfo(0, dealer1.address)
        pool1 = await rfAllocationStakingProxy.userInfo(1, dealer1.address)
        pool2 = await rfAllocationStakingProxy.userInfo(2, dealer1.address)
        pool3 = await rfAllocationStakingProxy.userInfo(3, dealer1.address)
        expect(pool0[2]).to.not.equal(0)
        expect(pool0[3]).to.not.equal(0)
        expect(pool1[2]).to.not.equal(0)
        expect(pool1[3]).to.not.equal(0)
        expect(pool2[2]).to.not.equal(0)
        expect(pool2[3]).to.not.equal(0)
        expect(pool3[2]).to.not.equal(0)
        expect(pool3[3]).to.not.equal(0)
        
        // dealer2 checks:
        expect(await rfAllocationStakingProxy.deposited(0, dealer2.address)).to.equal(ethers.utils.parseEther("1250"))
        expect(await rfAllocationStakingProxy.deposited(1, dealer2.address)).to.equal(ethers.utils.parseEther("1250"))
        expect(await rfAllocationStakingProxy.deposited(2, dealer2.address)).to.equal(ethers.utils.parseEther("1250"))
        expect(await rfAllocationStakingProxy.deposited(3, dealer2.address)).to.equal(ethers.utils.parseEther("1250"))
        expect(await rfAllocationStakingProxy.getCurrentTier(dealer2.address)).to.equal(2)
        expect(await rfAllocationStakingProxy.getTicketAmount(dealer2.address))
        .to.equal(ethers.utils.parseEther("5000").div(BigNumber.from(TOKENS_PER_TICKET).mul(ethers.utils.parseEther("1"))))
        pool0 = await rfAllocationStakingProxy.userInfo(0, dealer2.address)
        pool1 = await rfAllocationStakingProxy.userInfo(1, dealer2.address)
        pool2 = await rfAllocationStakingProxy.userInfo(2, dealer2.address)
        pool3 = await rfAllocationStakingProxy.userInfo(3, dealer2.address)
        expect(pool0[2]).to.not.equal(0)
        expect(pool0[3]).to.not.equal(0)
        expect(pool1[2]).to.not.equal(0)
        expect(pool1[3]).to.not.equal(0)
        expect(pool2[2]).to.not.equal(0)
        expect(pool2[3]).to.not.equal(0)
        expect(pool3[2]).to.not.equal(0)
        expect(pool3[3]).to.not.equal(0)

        // merchant1 checks:
        expect(await rfAllocationStakingProxy.deposited(0, merchant1.address)).to.equal(ethers.utils.parseEther("125"))
        expect(await rfAllocationStakingProxy.deposited(1, merchant1.address)).to.equal(ethers.utils.parseEther("125"))
        expect(await rfAllocationStakingProxy.deposited(2, merchant1.address)).to.equal(ethers.utils.parseEther("125"))
        expect(await rfAllocationStakingProxy.deposited(3, merchant1.address)).to.equal(ethers.utils.parseEther("125"))
        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(1)
        expect(await rfAllocationStakingProxy.getTicketAmount(merchant1.address))
        .to.equal(ethers.utils.parseEther("500").div(BigNumber.from(TOKENS_PER_TICKET).mul(ethers.utils.parseEther("1"))))
        pool0 = await rfAllocationStakingProxy.userInfo(0, merchant1.address)
        pool1 = await rfAllocationStakingProxy.userInfo(1, merchant1.address)
        pool2 = await rfAllocationStakingProxy.userInfo(2, merchant1.address)
        pool3 = await rfAllocationStakingProxy.userInfo(3, merchant1.address)
        expect(pool0[2]).to.not.equal(0)
        expect(pool0[3]).to.not.equal(0)
        expect(pool1[2]).to.not.equal(0)
        expect(pool1[3]).to.not.equal(0)
        expect(pool2[2]).to.not.equal(0)
        expect(pool2[3]).to.not.equal(0)
        expect(pool3[2]).to.not.equal(0)
        expect(pool3[3]).to.not.equal(0)

        // merchant2 checks:
        expect(await rfAllocationStakingProxy.deposited(0, merchant2.address)).to.equal(ethers.utils.parseEther("125"))
        expect(await rfAllocationStakingProxy.deposited(1, merchant2.address)).to.equal(ethers.utils.parseEther("125"))
        expect(await rfAllocationStakingProxy.deposited(2, merchant2.address)).to.equal(ethers.utils.parseEther("125"))
        expect(await rfAllocationStakingProxy.deposited(3, merchant2.address)).to.equal(ethers.utils.parseEther("125"))
        expect(await rfAllocationStakingProxy.getCurrentTier(merchant2.address)).to.equal(1)
        expect(await rfAllocationStakingProxy.getTicketAmount(merchant2.address))
        .to.equal(ethers.utils.parseEther("500").div(BigNumber.from(TOKENS_PER_TICKET).mul(ethers.utils.parseEther("1"))))
        pool0 = await rfAllocationStakingProxy.userInfo(0, merchant2.address)
        pool1 = await rfAllocationStakingProxy.userInfo(1, merchant2.address)
        pool2 = await rfAllocationStakingProxy.userInfo(2, merchant2.address)
        pool3 = await rfAllocationStakingProxy.userInfo(3, merchant2.address)
        expect(pool0[2]).to.not.equal(0)
        expect(pool0[3]).to.not.equal(0)
        expect(pool1[2]).to.not.equal(0)
        expect(pool1[3]).to.not.equal(0)
        expect(pool2[2]).to.not.equal(0)
        expect(pool2[3]).to.not.equal(0)
        expect(pool3[2]).to.not.equal(0)
        expect(pool3[3]).to.not.equal(0)

        // fan1 checks:
        expect(await rfAllocationStakingProxy.deposited(0, fan1.address)).to.equal(ethers.utils.parseEther("62.5"))
        expect(await rfAllocationStakingProxy.deposited(1, fan1.address)).to.equal(ethers.utils.parseEther("62.5"))
        expect(await rfAllocationStakingProxy.deposited(2, fan1.address)).to.equal(ethers.utils.parseEther("62.5"))
        expect(await rfAllocationStakingProxy.deposited(3, fan1.address)).to.equal(ethers.utils.parseEther("62.5"))
        expect(await rfAllocationStakingProxy.getCurrentTier(fan1.address)).to.equal(0)
        await expect(rfAllocationStakingProxy.getTicketAmount(fan1.address))
        .to.be.revertedWith("RF_SA: Brokers, Tycoons and Fans are not elligible for tickets")
        pool0 = await rfAllocationStakingProxy.userInfo(0, fan1.address)
        pool1 = await rfAllocationStakingProxy.userInfo(1, fan1.address)
        pool2 = await rfAllocationStakingProxy.userInfo(2, fan1.address)
        pool3 = await rfAllocationStakingProxy.userInfo(3, fan1.address)
        expect(pool0[2]).to.not.equal(0)
        expect(pool0[3]).to.not.equal(0)
        expect(pool1[2]).to.not.equal(0)
        expect(pool1[3]).to.not.equal(0)
        expect(pool2[2]).to.not.equal(0)
        expect(pool2[3]).to.not.equal(0)
        expect(pool3[2]).to.not.equal(0)
        expect(pool3[3]).to.not.equal(0)

        // fan2 checks:
        expect(await rfAllocationStakingProxy.deposited(0, fan2.address)).to.equal(ethers.utils.parseEther("62.5"))
        expect(await rfAllocationStakingProxy.deposited(1, fan2.address)).to.equal(ethers.utils.parseEther("62.5"))
        expect(await rfAllocationStakingProxy.deposited(2, fan2.address)).to.equal(ethers.utils.parseEther("62.5"))
        expect(await rfAllocationStakingProxy.deposited(3, fan2.address)).to.equal(ethers.utils.parseEther("62.5"))
        expect(await rfAllocationStakingProxy.getCurrentTier(fan2.address)).to.equal(0)
        await expect(rfAllocationStakingProxy.getTicketAmount(fan2.address))
        .to.be.revertedWith("RF_SA: Brokers, Tycoons and Fans are not elligible for tickets")
        pool0 = await rfAllocationStakingProxy.userInfo(0, fan2.address)
        pool1 = await rfAllocationStakingProxy.userInfo(1, fan2.address)
        pool2 = await rfAllocationStakingProxy.userInfo(2, fan2.address)
        pool3 = await rfAllocationStakingProxy.userInfo(3, fan2.address)
        expect(pool0[2]).to.not.equal(0)
        expect(pool0[3]).to.not.equal(0)
        expect(pool1[2]).to.not.equal(0)
        expect(pool1[3]).to.not.equal(0)
        expect(pool2[2]).to.not.equal(0)
        expect(pool2[3]).to.not.equal(0)
        expect(pool3[2]).to.not.equal(0)
        expect(pool3[3]).to.not.equal(0)
    })

    it("It should be able to get total pending", async () => {
        await rfAllocationStakingProxy.totalPending()
    })

    it("Staking in TierUpgradePool increases user's tier with time passed", async () => {
        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(1)

        await raiseToken.connect(merchant1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("500"))
        await rfAllocationStakingProxy.connect(merchant1).deposit(999999, ethers.utils.parseEther("500"))

        expect(
            await rfAllocationStakingProxy.totalRAISEDeposited()
        ).to.be.equal(ethers.utils.parseEther("312000"))

        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(1)

        // increase evm time by 180 days
        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 180]);
        await ethers.provider.send("evm_mine");

        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(2)

        // increase evm time by 180 days
        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 180]);
        await ethers.provider.send("evm_mine");

        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(3)

        // increase evm time by 360 days
        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 360]);
        await ethers.provider.send("evm_mine");

        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(4)
    })

    it("If user unstakes RAISE from TierUpgradePool, his tier is returned back to tier his staking amount accounts to and he receives pending tokens", async () => {
        await rfAllocationStakingProxy.connect(merchant1).withdraw(999999, 0)

        expect(
            await rfAllocationStakingProxy.totalRAISEDeposited()
        ).to.be.equal(ethers.utils.parseEther("311500"))

        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(1)
    })

    it("User can receive pending tokens", async () => {
        let userOldBalance = await raiseToken.balanceOf(merchant1.address)
        let pendingTokens = await rfAllocationStakingProxy.pendingReward(0, merchant1.address)
        await rfAllocationStakingProxy.connect(merchant1).withdraw(0, ethers.utils.parseEther("125"))
        let userNewBalance = await raiseToken.balanceOf(merchant1.address)
        let userInfo = await rfAllocationStakingProxy.userInfo(0, merchant1.address)

        expect(
            userInfo[1]
        ).to.be.equal(0)

        // expect(userNewBalance.sub(userOldBalance)).to.be.
        // console.log(userNewBalance)
        // console.log(userOldBalance)
        // console.log("Pending tokens: ", pendingTokens)
        // console.log("Difference: ", userNewBalance.sub(userOldBalance))

        // return withdrawn tokens 
        await raiseToken.connect(merchant1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("125"))
        await rfAllocationStakingProxy.connect(merchant1).deposit(0, ethers.utils.parseEther("125"))
    })

    it("If user staked tokens in TierUpgradePool and he adds tokens to RAISE LP pool that change his tier, changes occure in TUP", async () => {
        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(1)
        
        await raiseToken.connect(merchant1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("500"))
        await rfAllocationStakingProxy.connect(merchant1).deposit(999999, ethers.utils.parseEther("500"))

        // increase evm time by 180 days
        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 180]);
        await ethers.provider.send("evm_mine");

        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(2)

        await raiseToken.connect(merchant1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("4500"))
        await rfAllocationStakingProxy.connect(merchant1).deposit(0, ethers.utils.parseEther("4500"))

        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(2)

        // increase evm time by 180 days
        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 180]);
        await ethers.provider.send("evm_mine");
        
        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(3)

        // console.log(await rfAllocationStakingProxy.tierInfo(merchant1.address)) // 46 000 000 000 000 000 000 000
        // console.log(await rfAllocationStakingProxy.userInfo(0, merchant1.address))
        // console.log(await rfAllocationStakingProxy.userInfo(1, merchant1.address))
        // console.log(await rfAllocationStakingProxy.userInfo(2, merchant1.address))
        // console.log(await rfAllocationStakingProxy.userInfo(3, merchant1.address))
        // console.log(await rfAllocationStakingProxy.upgradePool(merchant1.address))

        // withdraw amount of RAISE tokens that will not change tier that is calculated from RAISE amount
        await rfAllocationStakingProxy.connect(merchant1).withdraw(0, ethers.utils.parseEther("500"))
        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(3)

        // withdraw amount of RAISE tokens that will change tier that is calculated from RAISE amount
        await rfAllocationStakingProxy.connect(merchant1).withdraw(0, ethers.utils.parseEther("1000"))
        expect(await rfAllocationStakingProxy.getCurrentTier(merchant1.address)).to.equal(2)
    })

    it("User pays a fee for early withdrawal and the fee is returned to contract as rewards", async () => {
        await rfAllocationStakingProxy.massUpdatePools()

        await raiseToken.connect(tycoon1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("10000"))
        await rfAllocationStakingProxy.connect(tycoon1).deposit(0, ethers.utils.parseEther("10000"))
        
        let userOldBalance = await raiseToken.balanceOf(tycoon1.address)

        // console.log(await raiseToken.balanceOf(rfAllocationStakingProxy.address))

        await rfAllocationStakingProxy.connect(tycoon1).withdraw(0, ethers.utils.parseEther("10000"))
        let userNewBalance = await raiseToken.balanceOf(tycoon1.address)

        // console.log(userOldBalance)
        // console.log(userNewBalance)
        // console.log("Received: ", userNewBalance.sub(userOldBalance))
        // console.log(await raiseToken.balanceOf(rfAllocationStakingProxy.address))
    })

    it("Makes sure that FAN staked for two weeks", async () => {
        expect(await rfAllocationStakingProxy.fanStakedForTwoWeeks(fan1.address)).to.equal(true)
        expect(await rfAllocationStakingProxy.fanStakedForTwoWeeks(fan2.address)).to.equal(true)

        let user = await rfAllocationStakingProxy.userInfo(0, saleOwner1.address)

        await raiseToken.connect(saleOwner1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("200"))
        await rfAllocationStakingProxy.connect(saleOwner1).deposit(0, ethers.utils.parseEther("200"))

        expect(await rfAllocationStakingProxy.fanStakedForTwoWeeks(saleOwner1.address)).to.equal(false)

    })

    it("Withdraw pending works and do not create conflicts for future deposits and withdrawals", async () => {        
        await rfAllocationStakingProxy.connect(fan1).withdrawPending(0)

        await raiseToken.connect(fan1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("1000"))
        await rfAllocationStakingProxy.connect(fan1).deposit(0, ethers.utils.parseEther("200"))

        await raiseToken.connect(broker1).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther("1000"))
        await rfAllocationStakingProxy.connect(broker1).deposit(0, ethers.utils.parseEther("200"))
        await rfAllocationStakingProxy.connect(broker1).withdraw(0, ethers.utils.parseEther("100"))
        await rfAllocationStakingProxy.connect(broker1).deposit(1, ethers.utils.parseEther("200"))
        await rfAllocationStakingProxy.connect(broker1).withdraw(1, ethers.utils.parseEther("100"))

        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]);
        await ethers.provider.send("evm_mine");

        await rfAllocationStakingProxy.connect(fan1).withdraw(0, ethers.utils.parseEther("200"))
    })

    it("Updates pool with no tokens in it", async () => {
        let prevPoolLength = await rfAllocationStakingProxy.poolLength()
        await rfAllocationStakingProxy.add(4000, paymentToken.address, 0, false)
        let newPoolLength = await rfAllocationStakingProxy.poolLength()

        expect(newPoolLength.sub(prevPoolLength)).to.be.equal(1)

        let pool = await rfAllocationStakingProxy.poolInfo(newPoolLength.sub(1))
        await rfAllocationStakingProxy.updatePool(5)
        let updatedPool = await rfAllocationStakingProxy.poolInfo(newPoolLength.sub(1))

        expect(pool[0]).to.be.equal(updatedPool[0])
        expect(pool[1]).to.be.equal(updatedPool[1])
        expect(pool[2]).to.be.below(updatedPool[2])
        expect(pool[3]).to.be.equal(updatedPool[3])
        expect(pool[4]).to.be.equal(updatedPool[4])
        expect(pool[5]).to.be.equal(updatedPool[5])
    })
    
    it("getPendingAndDepositedForUsers() returns proper info", async () => {
        let userInfo = await rfAllocationStakingProxy.getPendingAndDepositedForUsers([fan1.address, tycoon1.address], 0)
        let deposits = userInfo[0]
        let pending = userInfo[1]

        expect(deposits[0]).to.be.equal(ethers.utils.parseEther("62.5"))
        expect(deposits[1]).to.be.equal(ethers.utils.parseEther("25000"))

        expect(pending[0]).not.to.be.equal(0)
        expect(pending[1]).not.to.be.equal(0)
        
    })

    it("poolLength() returns proper info", async () => {
        let length = await rfAllocationStakingProxy.poolLength()

        expect(length).not.to.be.equal(0)
        expect(length).to.be.equal(6)
    })

    it("set() returns proper info", async () => {
        let prevPoolInfo = await rfAllocationStakingProxy.poolInfo(5)
        await rfAllocationStakingProxy.set(5, 5000, 0, false)
        let newPoolInfo = await rfAllocationStakingProxy.poolInfo(5)
        
        expect(newPoolInfo[0]).to.be.equal(prevPoolInfo[0])
        expect(newPoolInfo[1]).to.be.equal(5000)
        expect(newPoolInfo[2]).to.be.equal(prevPoolInfo[2])
        expect(newPoolInfo[3]).to.be.equal(prevPoolInfo[3])
        expect(newPoolInfo[4]).to.be.equal(prevPoolInfo[4])
        expect(newPoolInfo[5]).to.be.equal(prevPoolInfo[5])

    })

    it("Sale factory deploys a proxy directed to a sale implementation", async () => {
        await rfSaleFactoryProxy.connect(admin2).deploySale([])

        let latestSale = await rfSaleFactoryProxy.getLastDeployedSale()
        
        expect(latestSale).to.not.equal(0)
        expect(await rfSaleFactoryProxy.getNumberOfSalesDeployed()).to.equal(1)
        let salesArray = await rfSaleFactoryProxy.getSalesFromIndexToIndex(0, 1)
        expect(salesArray.length).to.equal(1)
        expect(salesArray[0]).to.equal(latestSale)
    })

    it("Initializing sale contract", async () => {
        let saleProxyAddress = await rfSaleFactoryProxy.getLastDeployedSale()
        let rfSaleProxyContract = await ethers.getContractFactory("RFProxy")
        let rfSaleProxyInterface = rfSaleProxyContract.interface
        let rfSaleProxyABI = rfSaleProxyInterface.format(ethers.utils.FormatTypes.minimal)
        let rfSaleInterface = rfSale.interface
        let rfSaleABI = rfSaleInterface.format(ethers.utils.FormatTypes.minimal)
        let rfSaleProxyCombinedABIArray = rfSaleProxyABI.concat(rfSaleABI)
        let rfSaleProxyCombinedABI = JSON.stringify(rfSaleProxyCombinedABIArray)
        rfSale1Proxy = new ethers.Contract(saleProxyAddress, rfSaleProxyCombinedABI, admin1)
        
        await rfSale1Proxy.initialize(admin.address, rfSaleFactoryProxy.address, rfAllocationStakingProxy.address, admin1.address)

        expect(await rfSale1Proxy.admin()).to.equal(admin.address)
        expect(await rfSale1Proxy.salesFactory()).to.equal(rfSaleFactoryProxy.address)
        expect(await rfSale1Proxy.allocationStaking()).to.equal(rfAllocationStakingProxy.address)
        expect(await rfSale1Proxy.ONE()).to.equal(ethers.utils.parseEther("1"))
        expect(await rfSale1Proxy.precisionForTierRoundPortions()).to.equal(10000)
        expect(await rfSale1Proxy.backend()).to.equal(admin1.address)
    })

    it("Setting sale parameters", async () => {
        await rfSale1Proxy.setSaleParams(saleToken1.address, paymentToken.address, saleOwner1.address, ethers.utils.parseEther(`${tokenPriceInPaymentToken}`))
        await rfSale1Proxy.updateTokenPriceInPaymentToken(ethers.utils.parseEther(`${tokenPriceInPaymentToken}`))

        expect(await rfSale1Proxy.saleToken()).to.equal(saleToken1.address)
        expect(await rfSale1Proxy.paymentToken()).to.equal(paymentToken.address)
        expect(await rfSale1Proxy.saleOwner()).to.equal(saleOwner1.address)
        expect(await rfSale1Proxy.tokenPriceInPaymentToken()).to.equal(ethers.utils.parseEther(`${tokenPriceInPaymentToken}`))
        expect(await rfSale1Proxy.isSaleCreated()).to.equal(true)
    })

    it("Funding sale1", async () => {
        await saleToken1.connect(saleOwner1).approve(rfSale1Proxy.address, ethers.utils.parseEther(`${sale1FundAmount}`))
        await rfSale1Proxy.connect(saleOwner1).fundSale(ethers.utils.parseEther(`${sale1FundAmount}`))

        expect(await rfSale1Proxy.amountOfSaleTokensDeposited()).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`))
        expect(await rfSale1Proxy.saleFunded()).to.equal(true)
        expect(await saleToken1.balanceOf(rfSale1Proxy.address)).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`))
    
    })

    it("Setting sale1 registration time", async () => {
        let timestamp = await getTimestamp()
        let registrationTimeStarts = timestamp + 60 * 60 * 24 * 10
        let registrationTimeEnds = timestamp + 60 * 60 * 24 * 20

        await rfSale1Proxy.setRegistrationTime(registrationTimeStarts, registrationTimeEnds)
        
        expect(await rfSale1Proxy.registrationTimeStarts()).to.equal(registrationTimeStarts)
        expect(await rfSale1Proxy.registrationTimeEnds()).to.equal(registrationTimeEnds)
    })

    it("Setting vesting parameters of the sale1", async () => {
        let timestamp = await getTimestamp()
        let vestingPortionsUnlockTime = [timestamp + 60 * 60 * 24 * 60, timestamp + 60 * 60 * 24 * 61, timestamp + 60 * 60 * 24 * 62, timestamp + 60 * 60 * 24 * 63, timestamp + 60 * 60 * 24 * 64]
        let vestingPercentPerPortion = [3000, 1750, 1750, 1750, 1750]
        let initialSetup = true

        await rfSale1Proxy.setVestingParams(vestingPortionsUnlockTime, vestingPercentPerPortion, initialSetup)

        let [vestingUnlockTimes, vestingPercentPerPortions] = await rfSale1Proxy.getVestingInfo()

        for (i = 0; i < vestingPortionsUnlockTime.length; i++) {
            vestingPortionsUnlockTime[i] = BigNumber.from(vestingPortionsUnlockTime[i])
            vestingPercentPerPortion[i] = BigNumber.from(vestingPercentPerPortion[i])
        }

        for (i = 0; i < vestingPortionsUnlockTime.length; i++) {
            expect(vestingUnlockTimes[i]).to.equal(vestingPortionsUnlockTime[i])
            expect(vestingPercentPerPortions[i]).to.equal(vestingPercentPerPortion[i])
        }

        await rfSale1Proxy.extendRegistrationPeriod(1, false)
        await rfSale1Proxy.extendRegistrationPeriod(1, true)

    })

    it("Setting tier round info", async () => {
        let minBuyAmountInPaymentTokens = [
            ethers.utils.parseEther(`${minBuyAmountInPaymentToken[0]}`),
            ethers.utils.parseEther(`${minBuyAmountInPaymentToken[1]}`),
            ethers.utils.parseEther(`${minBuyAmountInPaymentToken[2]}`),
            ethers.utils.parseEther(`${minBuyAmountInPaymentToken[3]}`)
        ]
        let maxBuyAmountInPaymentTokens = [
            ethers.utils.parseEther(`${maxBuyAmountInPaymentToken[0]}`),
            ethers.utils.parseEther(`${maxBuyAmountInPaymentToken[1]}`),
            ethers.utils.parseEther(`${maxBuyAmountInPaymentToken[2]}`),
            ethers.utils.parseEther(`${maxBuyAmountInPaymentToken[3]}`)
        ]

        await rfSale1Proxy.setTierRoundInfo(portionsOfTotalAmountOfTokensPerRound, minBuyAmountInPaymentTokens, maxBuyAmountInPaymentTokens)

        let roundInfo1 = await rfSale1Proxy.getRoundInfo(0)
        let roundInfo2 = await rfSale1Proxy.getRoundInfo(1)
        let roundInfo3 = await rfSale1Proxy.getRoundInfo(2)
        let roundInfo4 = await rfSale1Proxy.getRoundInfo(3)

        expect(roundInfo1[0]).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`).mul(BigNumber.from(portionsOfTotalAmountOfTokensPerRound[0])).div(10000))
        expect(roundInfo1[1]).to.equal(0)
        expect(roundInfo1[2]).to.equal(minBuyAmountInPaymentTokens[0])
        expect(roundInfo1[3]).to.equal(maxBuyAmountInPaymentTokens[0])

        expect(roundInfo2[0]).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`).mul(BigNumber.from(portionsOfTotalAmountOfTokensPerRound[1])).div(10000))
        expect(roundInfo2[1]).to.equal(0)
        expect(roundInfo2[2]).to.equal(minBuyAmountInPaymentTokens[1])
        expect(roundInfo2[3]).to.equal(maxBuyAmountInPaymentTokens[1])

        expect(roundInfo3[0]).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`).mul(BigNumber.from(portionsOfTotalAmountOfTokensPerRound[2])).div(10000))
        expect(roundInfo3[1]).to.equal(0)
        expect(roundInfo3[2]).to.equal(minBuyAmountInPaymentTokens[2])
        expect(roundInfo3[3]).to.equal(maxBuyAmountInPaymentTokens[2])

        expect(roundInfo4[0]).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`).mul(BigNumber.from(portionsOfTotalAmountOfTokensPerRound[3])).div(10000))
        expect(roundInfo4[1]).to.equal(0)
        expect(roundInfo4[2]).to.equal(minBuyAmountInPaymentTokens[3])
        expect(roundInfo4[3]).to.equal(maxBuyAmountInPaymentTokens[3])
    })

    it("Registering users for sale", async() => {
        // let merchantsArray = []      // let merchantsBuyAmounts = []     // let merchantsPayAmounts = []
        // let dealersArray = []        // let dealersBuyAmounts = []       // let dealersPayAmounts = []
        // let brokersArray = []        // let brokersBuyAmounts = []       // let brokersPayAmounts = []
        // let tycoonsArray = []        // let tycoonsBuyAmounts = []       // let tycoonsPayAmounts = []

        // let merchantsTotalPurchases = 0      // let merchantsPoolIndexes = []      // let totalPurchases = 0
        // let dealersTotalPurchases = 0        // let dealersPoolIndexes = []        // let fanTierAmount = 200000
        // let brokersTotalPurchases = 0        // let brokersPoolIndexes = []
        // let tycoonsTotalPurchases = 0        // let tycoonsPoolIndexes = []
        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10])
        await ethers.provider.send("evm_mine", [])

        let raisePoolIndexes = [0, 1, 2, 3, 999999]
        let minRaiseStakedForMerchants = 500
        let minRaiseStakedForDealers = 5000
        let minRaiseStakedForBrokers = 50000
        let minRaiseStakedForTycoons = 100000

        for (merchantsTotalPurchases; merchantsTotalPurchases < sale1FundAmount * portionsOfTotalAmountOfTokensPerRound[0] / 10000  - fanTierAmount / 4;) {
            let merchant = users[newSignerIndex++]
            merchantsArray.push(merchant)
            let merchantsBuyAmount = randomNumber(minBuyAmountInPaymentToken[0], maxBuyAmountInPaymentToken[0] + 1)
            // totalPaid += merchantsBuyAmount
            let poolIndex = raisePoolIndexes[[Math.floor(Math.random() * raisePoolIndexes.length)]]

            // merchantsPayAmounts.push(merchantsBuyAmount)
            merchantsTotalPurchases += merchantsBuyAmount * 0.5
            // totalPurchases += merchantsBuyAmount * 0.5
            merchantsPoolIndexes.push(poolIndex)

            numberOfRegistrants++

            await raiseToken.connect(admin1).mint(merchant.address, ethers.utils.parseEther(`${minRaiseStakedForMerchants}`))
            await paymentToken.connect(admin1).mint(merchant.address, ethers.utils.parseEther(`${merchantsBuyAmount}`))

            await raiseToken.connect(merchant).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther(`${minRaiseStakedForMerchants}`))
            await rfAllocationStakingProxy.connect(merchant).deposit(poolIndex, ethers.utils.parseEther(`${minRaiseStakedForMerchants}`))
            await paymentToken.connect(merchant).approve(rfSale1Proxy.address, ethers.utils.parseEther(`${merchantsBuyAmount}`))
            await rfSale1Proxy.connect(merchant).registerForSale(ethers.utils.parseEther(`${merchantsBuyAmount}`))

            let merchantRound = await rfSale1Proxy.getRoundInfo(0)
            let merchantInfo = await rfSale1Proxy.getUsersRegistryInfo(merchant.address)

            expect(merchantRound[0]).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`).mul(BigNumber.from(portionsOfTotalAmountOfTokensPerRound[0])).div(10000))
            expect(merchantRound[1]).to.equal(0)
            expect(merchantRound[2]).to.equal(ethers.utils.parseEther(`${minBuyAmountInPaymentToken[0]}`))
            expect(merchantRound[3]).to.equal(ethers.utils.parseEther(`${maxBuyAmountInPaymentToken[0]}`))

            expect(merchantInfo[0]).to.equal(0)
            expect(merchantInfo[1]).to.equal(1)
            expect(merchantInfo[2]).to.equal(ethers.utils.parseEther(`${merchantsBuyAmount}`).mul(ethers.utils.parseEther(`${tokenPriceInPaymentToken}`)).div(ethers.utils.parseEther("1")))

            expect(await rfSale1Proxy.numberOfRegistrants()).to.equal(numberOfRegistrants)
        }
    
        for (dealersTotalPurchases; dealersTotalPurchases < sale1FundAmount * portionsOfTotalAmountOfTokensPerRound[1] / 10000 - fanTierAmount / 4;) {
            let dealer = users[newSignerIndex++]
            dealersArray.push(dealer)
            let dealersBuyAmount = randomNumber(minBuyAmountInPaymentToken[1], maxBuyAmountInPaymentToken[1] + 1)
            // totalPaid += dealersBuyAmount
            let poolIndex = raisePoolIndexes[[Math.floor(Math.random() * raisePoolIndexes.length)]]

        //     dealersPayAmounts.push(dealersBuyAmount)
            dealersTotalPurchases += dealersBuyAmount * 0.5
            // totalPurchases += dealersBuyAmount * 0.5
            dealersPoolIndexes.push(poolIndex)

            numberOfRegistrants++

            await raiseToken.connect(admin1).mint(dealer.address, ethers.utils.parseEther(`${minRaiseStakedForDealers}`))
            await paymentToken.connect(admin1).mint(dealer.address, ethers.utils.parseEther(`${dealersBuyAmount}`))

            await raiseToken.connect(dealer).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther(`${minRaiseStakedForDealers}`))
            await rfAllocationStakingProxy.connect(dealer).deposit(poolIndex, ethers.utils.parseEther(`${minRaiseStakedForDealers}`))
            await paymentToken.connect(dealer).approve(rfSale1Proxy.address, ethers.utils.parseEther(`${dealersBuyAmount}`))
            await rfSale1Proxy.connect(dealer).registerForSale(ethers.utils.parseEther(`${dealersBuyAmount}`))

            let dealerRound = await rfSale1Proxy.getRoundInfo(1)
            let dealerInfo = await rfSale1Proxy.getUsersRegistryInfo(dealer.address)

            expect(dealerRound[0]).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`).mul(BigNumber.from(portionsOfTotalAmountOfTokensPerRound[1])).div(10000))
            expect(dealerRound[1]).to.equal(0)
            expect(dealerRound[2]).to.equal(ethers.utils.parseEther(`${minBuyAmountInPaymentToken[1]}`))
            expect(dealerRound[3]).to.equal(ethers.utils.parseEther(`${maxBuyAmountInPaymentToken[1]}`))

            expect(dealerInfo[0]).to.equal(1)
            expect(dealerInfo[1]).to.equal(10)
            expect(dealerInfo[2]).to.equal(ethers.utils.parseEther(`${dealersBuyAmount}`).mul(ethers.utils.parseEther(`${tokenPriceInPaymentToken}`)).div(ethers.utils.parseEther("1")))

            expect(await rfSale1Proxy.numberOfRegistrants()).to.equal(numberOfRegistrants)
        }

        for (brokersTotalPurchases; brokersTotalPurchases < sale1FundAmount * portionsOfTotalAmountOfTokensPerRound[2] / 10000 - fanTierAmount / 4;) {
            let broker = users[newSignerIndex++]
            brokersArray.push(broker)
            let brokersBuyAmount = randomNumber(minBuyAmountInPaymentToken[2], maxBuyAmountInPaymentToken[2] + 1)
            totalPaid += brokersBuyAmount
            let poolIndex = raisePoolIndexes[[Math.floor(Math.random() * raisePoolIndexes.length)]]

        //     brokersPayAmounts.push(brokersBuyAmount)
            brokersTotalPurchases += brokersBuyAmount * 0.5
            totalPurchases += brokersBuyAmount * 0.5
            brokersPoolIndexes.push(poolIndex)

            numberOfRegistrants++

            await raiseToken.connect(admin1).mint(broker.address, ethers.utils.parseEther(`${minRaiseStakedForBrokers}`))
            await paymentToken.connect(admin1).mint(broker.address, ethers.utils.parseEther(`${brokersBuyAmount}`))

            await raiseToken.connect(broker).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther(`${minRaiseStakedForBrokers}`))
            await rfAllocationStakingProxy.connect(broker).deposit(poolIndex, ethers.utils.parseEther(`${minRaiseStakedForBrokers}`))
            await paymentToken.connect(broker).approve(rfSale1Proxy.address, ethers.utils.parseEther(`${brokersBuyAmount}`))
            await rfSale1Proxy.connect(broker).registerForSale(ethers.utils.parseEther(`${brokersBuyAmount}`))

            let brokerRound = await rfSale1Proxy.getRoundInfo(2)
            let brokerInfo = await rfSale1Proxy.getUsersRegistryInfo(broker.address)

            expect(brokerRound[0]).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`).mul(BigNumber.from(portionsOfTotalAmountOfTokensPerRound[2])).div(10000))
            expect(brokerRound[1]).to.equal(ethers.utils.parseEther(`${brokersTotalPurchases}`))
            expect(brokerRound[2]).to.equal(ethers.utils.parseEther(`${minBuyAmountInPaymentToken[2]}`))
            expect(brokerRound[3]).to.equal(ethers.utils.parseEther(`${maxBuyAmountInPaymentToken[2]}`))

            expect(brokerInfo[0]).to.equal(2)
            expect(brokerInfo[1]).to.equal(0)
            expect(brokerInfo[2]).to.equal(ethers.utils.parseEther(`${brokersBuyAmount}`).mul(ethers.utils.parseEther(`${tokenPriceInPaymentToken}`)).div(ethers.utils.parseEther("1")))

            expect(await rfSale1Proxy.numberOfRegistrants()).to.equal(numberOfRegistrants)
        }

        for (tycoonsTotalPurchases; tycoonsTotalPurchases < sale1FundAmount * portionsOfTotalAmountOfTokensPerRound[3] / 10000 - fanTierAmount / 4;) {
            let tycoon = users[newSignerIndex++]
            tycoonsArray.push(tycoon)
            let tycoonsBuyAmount = randomNumber(minBuyAmountInPaymentToken[3], maxBuyAmountInPaymentToken[3] + 1)
            totalPaid += tycoonsBuyAmount
            let poolIndex = raisePoolIndexes[[Math.floor(Math.random() * raisePoolIndexes.length)]]

        //     tycoonsPayAmounts.push(tycoonsBuyAmount)
            tycoonsTotalPurchases += tycoonsBuyAmount * 0.5
            totalPurchases += tycoonsBuyAmount * 0.5
            tycoonsPoolIndexes.push(poolIndex)

            numberOfRegistrants++

            await raiseToken.connect(admin1).mint(tycoon.address, ethers.utils.parseEther(`${minRaiseStakedForTycoons}`))
            await paymentToken.connect(admin1).mint(tycoon.address, ethers.utils.parseEther(`${tycoonsBuyAmount}`))

            await raiseToken.connect(tycoon).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther(`${minRaiseStakedForTycoons}`))
            await rfAllocationStakingProxy.connect(tycoon).deposit(poolIndex, ethers.utils.parseEther(`${minRaiseStakedForTycoons}`))
            await paymentToken.connect(tycoon).approve(rfSale1Proxy.address, ethers.utils.parseEther(`${tycoonsBuyAmount}`))
            await rfSale1Proxy.connect(tycoon).registerForSale(ethers.utils.parseEther(`${tycoonsBuyAmount}`))

            let tycoonRound = await rfSale1Proxy.getRoundInfo(3)
            let tycoonInfo = await rfSale1Proxy.getUsersRegistryInfo(tycoon.address)

            expect(tycoonRound[0]).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`).mul(BigNumber.from(portionsOfTotalAmountOfTokensPerRound[3])).div(10000))
            expect(tycoonRound[1]).to.equal(ethers.utils.parseEther(`${tycoonsTotalPurchases}`))
            expect(tycoonRound[2]).to.equal(ethers.utils.parseEther(`${minBuyAmountInPaymentToken[3]}`))
            expect(tycoonRound[3]).to.equal(ethers.utils.parseEther(`${maxBuyAmountInPaymentToken[3]}`))

            expect(tycoonInfo[0]).to.equal(3)
            expect(tycoonInfo[1]).to.equal(0)
            expect(tycoonInfo[2]).to.equal(ethers.utils.parseEther(`${tycoonsBuyAmount}`).mul(ethers.utils.parseEther(`${tokenPriceInPaymentToken}`)).div(ethers.utils.parseEther("1")))

            expect(await rfSale1Proxy.numberOfRegistrants()).to.equal(numberOfRegistrants)
        }
    })

    it("Set whitelist root hashes as well as total amount bought by merchants and brokers", async () => {
        let timestamp = await getTimestamp()
        await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp + 60 * 60 * 24 * 10])
        await ethers.provider.send("evm_mine")

        let merchantsLeafes = []
        let merchantsTockensBought = []
        let totalPurchasedByMerchants = ethers.utils.parseEther("0")
        let maxAmountBoughtByMerchants = ethers.utils.parseEther(`${sale1FundAmount * portionsOfTotalAmountOfTokensPerRound[0] / 10000}`)

        let dealersLeafes = []
        let dealersTockensBought = []
        let totalPurchasedByDealers = ethers.utils.parseEther("0")
        let maxAmountBoughtByDealers = ethers.utils.parseEther(`${sale1FundAmount * portionsOfTotalAmountOfTokensPerRound[1] / 10000}`)

        let lastAmountAdded = ethers.utils.parseEther("0")
        while (!maxAmountBoughtByMerchants.lte(totalPurchasedByMerchants.add(lastAmountAdded))) {
            let startingIndex = 0
            let endingIndex = 100
            
            let merchantsBatch = await rfSale1Proxy.getRegisteredMerchantsAddresses(startingIndex, endingIndex)
            
            startingIndex += 100
            endingIndex += 100
            
            for (i = 0; i < merchantsBatch.length; i++) {
                let userInfo = await rfSale1Proxy.getUsersRegistryInfo(merchantsBatch[i])
                lastAmountAdded = userInfo[2]
                
                if (!maxAmountBoughtByMerchants.lte(totalPurchasedByMerchants.add(lastAmountAdded))) {
                    merchantsLeafes.push(merchantsBatch[i])
                    merchantsTockensBought.push(lastAmountAdded)
                    totalPurchasedByMerchants = totalPurchasedByMerchants.add(lastAmountAdded)
                } else {
                    break
                }
            }
        }

        lastAmountAdded = ethers.utils.parseEther("0")
        while (!maxAmountBoughtByDealers.lte(totalPurchasedByDealers.add(lastAmountAdded))) {
            let startingIndex = 0
            let endingIndex = 100
            
            let dealersBatch = await rfSale1Proxy.getRegisteredDealersAddresses(startingIndex, endingIndex)
            
            startingIndex += 100
            endingIndex += 100
            
            for (i = 0; i < dealersBatch.length; i++) {
                let userInfo = await rfSale1Proxy.getUsersRegistryInfo(dealersBatch[i])
                lastAmountAdded = userInfo[2]
                
                if (!maxAmountBoughtByDealers.lte(totalPurchasedByDealers.add(lastAmountAdded))) {
                    dealersLeafes.push(dealersBatch[i])
                    dealersTockensBought.push(lastAmountAdded)
                    totalPurchasedByDealers = totalPurchasedByDealers.add(lastAmountAdded)
                } else {
                    break
                }
            }
        }

        totalPaid += parseFloat(ethers.utils.formatUnits(totalPurchasedByMerchants, 18)) + parseFloat(ethers.utils.formatUnits(totalPurchasedByDealers, 18))
        totalPurchases += parseFloat(ethers.utils.formatUnits(totalPurchasedByMerchants, 18)) + parseFloat(ethers.utils.formatUnits(totalPurchasedByDealers, 18))

        let merchantsEncodedLeafes = merchantsLeafes.map(addr => ethers.utils.keccak256(addr))
        merchantsTree = new MerkleTree(merchantsEncodedLeafes, ethers.utils.keccak256, {sortPairs: true})
        merchantRootHash = merchantsTree.getHexRoot()

        let dealersEncodedLeafes = dealersLeafes.map(addr => ethers.utils.keccak256(addr))
        dealersTree = new MerkleTree(dealersEncodedLeafes, ethers.utils.keccak256, {sortPairs: true})
        dealerRootHash = dealersTree.getHexRoot()

        await rfSale1Proxy.setWhitelistRootHashes(totalPurchasedByMerchants, totalPurchasedByDealers, merchantRootHash, dealerRootHash)

        expect(await rfSale1Proxy.amountOfPaymentTokensRaised()).to.equal(ethers.utils.parseEther(`${totalPaid}`))
        expect(await rfSale1Proxy.amountOfSaleTokensSold()).to.equal(ethers.utils.parseEther(`${totalPurchases}`))
        expect(await rfSale1Proxy.whitelistRootHashForMerchants()).to.equal(merchantRootHash)
        expect(await rfSale1Proxy.whitelistRootHashForDealers()).to.equal(dealerRootHash)
    })

    it("Starting fan round", async () => {
        await rfSale1Proxy.startFanRound(ethers.utils.parseEther(`${fanMinBuyAmountInPaymentToken}`), ethers.utils.parseEther(`${fanMaxBuyAmountInPaymentToken}`))

        // uint256 _tokensAvailable,
        // uint256 _tokensPurchased,
        // uint256 _minBuyAmountInPaymentTokens,
        // uint256 _maxBuyAmountInPaymentTokens
        let fanRoundInfo = await rfSale1Proxy.getRoundInfo(4)

        expect(fanRoundInfo[0]).to.equal(ethers.utils.parseEther(`${sale1FundAmount - totalPurchases}`))
        expect(fanRoundInfo[1]).to.equal(0)
        expect(fanRoundInfo[2]).to.equal(ethers.utils.parseEther(`${fanMinBuyAmountInPaymentToken}`))
        expect(fanRoundInfo[3]).to.equal(ethers.utils.parseEther(`${fanMaxBuyAmountInPaymentToken}`))

    })

    it("Registers FAN users for sale", async () => {
        let fan
        let fanAmounts = []
        let fanBuyAmount
        // let firstFanStaked = false
        for (fansTotalPurchases; fansTotalPurchases <= sale1FundAmount - totalPurchases;) {
            fanBuyAmount = randomNumber(fanMinBuyAmountInPaymentToken, fanMaxBuyAmountInPaymentToken + 1)
            fanAmounts.push(fanBuyAmount)

            // fan users stake RAISE tokens for two weeks
            fan = users[newSignerIndex++]
            fansArray.push(fan)
            let minRaiseStakedForFans = 200
            
            totalPaid += fanBuyAmount
            fansTotalPurchases += fanBuyAmount * 0.5
            totalPurchases += fanBuyAmount * 0.5

            numberOfRegistrants++

            await raiseToken.connect(admin1).mint(fan.address, ethers.utils.parseEther(`${minRaiseStakedForFans}`))
            await raiseToken.connect(fan).approve(rfAllocationStakingProxy.address, ethers.utils.parseEther(`${minRaiseStakedForFans}`))
            await rfAllocationStakingProxy.connect(fan).deposit(2, ethers.utils.parseEther(`${minRaiseStakedForFans}`))
        }

        totalPurchases -= fanBuyAmount * 0.5
        fansArray.pop()

        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 15])
        await ethers.provider.send("evm_mine")

        for (i = 0; i < fansArray.length; i++) {
            await paymentToken.connect(admin1).mint(fansArray[i].address, ethers.utils.parseEther(`${fanAmounts[i]}`))
            await paymentToken.connect(fansArray[i]).approve(rfSale1Proxy.address, ethers.utils.parseEther(`${fanAmounts[i]}`))
            await rfSale1Proxy.connect(fansArray[i]).registerForSale(ethers.utils.parseEther(`${fanAmounts[i]}`))

            let fanInfo = await rfSale1Proxy.getUsersRegistryInfo(fansArray[i].address)

            expect(fanInfo[0]).to.equal(4)
            expect(fanInfo[1]).to.equal(0)
            expect(fanInfo[2]).to.equal(ethers.utils.parseEther(`${fanAmounts[i]}`).mul(ethers.utils.parseEther(`${tokenPriceInPaymentToken}`)).div(ethers.utils.parseEther("1")))
        }
    })

    it("Users can claim tokens", async () => {
        let [vestingPeriods, vestingPotions] = await rfSale1Proxy.getVestingInfo()
        let timeTlillVestingPeriod = parseInt(vestingPeriods[0].toNumber(), 10) - await getTimestamp()
        
        await ethers.provider.send("evm_increaseTime", [timeTlillVestingPeriod])
        await ethers.provider.send("evm_mine")

        await expect(
            rfSale1Proxy.connect(saleOwner1).withdrawLeftoverSaleTokens()
        ).to.be.revertedWith("Leftover sale tokens can be withdrawn only after first vesting portion is unlocked.")

        let prevSignature
        let prevMessage

        for (i = 0; i < fansArray.length; i++) {
            let fan = fansArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(fan.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [fan.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(fan).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(fan).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash

            await rfSale1Proxy.connect(fan).claimTokens([], messageHash, signature)
            
            let newRaiseAmount = await saleToken1.balanceOf(fan.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(fan.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[0]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < merchantsArray.length; i++) {
            let merchant = merchantsArray[i]
            let merkleProof = merchantsTree.getHexProof(ethers.utils.keccak256(merchant.address))


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [merchant.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens(merkleProof, messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens(merkleProof, prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens([], messageHash, signature)
                ).to.be.revertedWith("Merkle proof must be provided for MERCHNATS and DEALERS.")
            }

            prevSignature = signature
            prevMessage = messageHash


            let prevRaiseAmount = await saleToken1.balanceOf(merchant.address)
            
            await rfSale1Proxy.connect(merchant).claimTokens(merkleProof, messageHash, signature)

            let newRaiseAmount = await saleToken1.balanceOf(merchant.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(merchant.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[0]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < dealersArray.length; i++) {
            let dealer = dealersArray[i]
            let merkleProof = dealersTree.getHexProof(ethers.utils.keccak256(dealer.address))


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [dealer.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(dealer).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(dealer).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash



            let prevRaiseAmount = await saleToken1.balanceOf(dealer.address)
            
            await rfSale1Proxy.connect(dealer).claimTokens(merkleProof, messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(dealer.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(dealer.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[0]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < brokersArray.length; i++) {
            let broker = brokersArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(broker.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [broker.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(broker).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(broker).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash


            
            await rfSale1Proxy.connect(broker).claimTokens([], messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(broker.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(broker.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[0]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < tycoonsArray.length; i++) {
            let tycoon = tycoonsArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(tycoon.address)



            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [tycoon.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(tycoon).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(tycoon).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash


            
            await rfSale1Proxy.connect(tycoon).claimTokens([], messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(tycoon.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(tycoon.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[0]}`)).div(ethers.utils.parseEther("10000")))
        }

        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24])
        await ethers.provider.send("evm_mine")

        for (i = 0; i < fansArray.length; i++) {
            let fan = fansArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(fan.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [fan.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(fan).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(fan).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash



            await rfSale1Proxy.connect(fan).claimTokens([], messageHash, signature)
            
            let newRaiseAmount = await saleToken1.balanceOf(fan.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(fan.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[1]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < merchantsArray.length; i++) {
            let merchant = merchantsArray[i]
            let merkleProof = merchantsTree.getHexProof(ethers.utils.keccak256(merchant.address))


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [merchant.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens(merkleProof, messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens(merkleProof, prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens([], messageHash, signature)
                ).to.be.revertedWith("Merkle proof must be provided for MERCHNATS and DEALERS.")
            }

            prevSignature = signature
            prevMessage = messageHash


            let prevRaiseAmount = await saleToken1.balanceOf(merchant.address)
            
            await rfSale1Proxy.connect(merchant).claimTokens(merkleProof, messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(merchant.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(merchant.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[1]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < dealersArray.length; i++) {
            let dealer = dealersArray[i]
            let merkleProof = dealersTree.getHexProof(ethers.utils.keccak256(dealer.address))


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [dealer.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(dealer).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(dealer).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash


            let prevRaiseAmount = await saleToken1.balanceOf(dealer.address)
            
            await rfSale1Proxy.connect(dealer).claimTokens(merkleProof, messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(dealer.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(dealer.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[1]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < brokersArray.length; i++) {
            let broker = brokersArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(broker.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [broker.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(broker).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(broker).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash

            
            await rfSale1Proxy.connect(broker).claimTokens([], messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(broker.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(broker.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[1]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < tycoonsArray.length; i++) {
            let tycoon = tycoonsArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(tycoon.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [tycoon.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(tycoon).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(tycoon).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash

            
            await rfSale1Proxy.connect(tycoon).claimTokens([], messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(tycoon.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(tycoon.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[1]}`)).div(ethers.utils.parseEther("10000")))
        }

        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24])
        await ethers.provider.send("evm_mine")

        for (i = 0; i < fansArray.length; i++) {
            let fan = fansArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(fan.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [fan.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(fan).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(fan).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash



            await rfSale1Proxy.connect(fan).claimTokens([], messageHash, signature)
            
            let newRaiseAmount = await saleToken1.balanceOf(fan.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(fan.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[2]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < merchantsArray.length; i++) {
            let merchant = merchantsArray[i]
            let merkleProof = merchantsTree.getHexProof(ethers.utils.keccak256(merchant.address))


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [merchant.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens(merkleProof, messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens(merkleProof, prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens([], messageHash, signature)
                ).to.be.revertedWith("Merkle proof must be provided for MERCHNATS and DEALERS.")
            }

            prevSignature = signature
            prevMessage = messageHash



            let prevRaiseAmount = await saleToken1.balanceOf(merchant.address)
            
            await rfSale1Proxy.connect(merchant).claimTokens(merkleProof, messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(merchant.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(merchant.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[2]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < dealersArray.length; i++) {
            let dealer = dealersArray[i]
            let merkleProof = dealersTree.getHexProof(ethers.utils.keccak256(dealer.address))


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [dealer.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(dealer).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(dealer).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash



            let prevRaiseAmount = await saleToken1.balanceOf(dealer.address)
            
            await rfSale1Proxy.connect(dealer).claimTokens(merkleProof, messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(dealer.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(dealer.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[2]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < brokersArray.length; i++) {
            let broker = brokersArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(broker.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [broker.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(broker).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(broker).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash


            
            await rfSale1Proxy.connect(broker).claimTokens([], messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(broker.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(broker.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[2]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < tycoonsArray.length; i++) {
            let tycoon = tycoonsArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(tycoon.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [tycoon.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(tycoon).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(tycoon).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash


            
            await rfSale1Proxy.connect(tycoon).claimTokens([], messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(tycoon.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(tycoon.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[2]}`)).div(ethers.utils.parseEther("10000")))
        }

        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24])
        await ethers.provider.send("evm_mine")

        for (i = 0; i < fansArray.length; i++) {
            let fan = fansArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(fan.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [fan.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(fan).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(fan).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash



            await rfSale1Proxy.connect(fan).claimTokens([], messageHash, signature)
            
            let newRaiseAmount = await saleToken1.balanceOf(fan.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(fan.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[2]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < merchantsArray.length; i++) {
            let merchant = merchantsArray[i]
            let merkleProof = merchantsTree.getHexProof(ethers.utils.keccak256(merchant.address))


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [merchant.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens(merkleProof, messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens(merkleProof, prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens([], messageHash, signature)
                ).to.be.revertedWith("Merkle proof must be provided for MERCHNATS and DEALERS.")
            }

            prevSignature = signature
            prevMessage = messageHash



            let prevRaiseAmount = await saleToken1.balanceOf(merchant.address)
            
            await rfSale1Proxy.connect(merchant).claimTokens(merkleProof, messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(merchant.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(merchant.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[2]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < dealersArray.length; i++) {
            let dealer = dealersArray[i]
            let merkleProof = dealersTree.getHexProof(ethers.utils.keccak256(dealer.address))


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [dealer.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(dealer).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(dealer).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash



            let prevRaiseAmount = await saleToken1.balanceOf(dealer.address)
            
            await rfSale1Proxy.connect(dealer).claimTokens(merkleProof, messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(dealer.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(dealer.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[2]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < brokersArray.length; i++) {
            let broker = brokersArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(broker.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [broker.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(broker).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(broker).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash


            
            await rfSale1Proxy.connect(broker).claimTokens([], messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(broker.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(broker.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[2]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < tycoonsArray.length; i++) {
            let tycoon = tycoonsArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(tycoon.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [tycoon.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(tycoon).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(tycoon).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash

            
            await rfSale1Proxy.connect(tycoon).claimTokens([], messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(tycoon.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(tycoon.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[2]}`)).div(ethers.utils.parseEther("10000")))
        }

        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24])
        await ethers.provider.send("evm_mine")

        for (i = 0; i < fansArray.length; i++) {
            let fan = fansArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(fan.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [fan.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(fan).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(fan).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash



            await rfSale1Proxy.connect(fan).claimTokens([], messageHash, signature)
            
            let newRaiseAmount = await saleToken1.balanceOf(fan.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(fan.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[3]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < merchantsArray.length; i++) {
            let merchant = merchantsArray[i]
            let merkleProof = merchantsTree.getHexProof(ethers.utils.keccak256(merchant.address))
            let prevRaiseAmount = await saleToken1.balanceOf(merchant.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [merchant.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens(merkleProof, messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens(merkleProof, prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
                await expect(
                    rfSale1Proxy.connect(merchant).claimTokens([], messageHash, signature)
                ).to.be.revertedWith("Merkle proof must be provided for MERCHNATS and DEALERS.")
            }

            prevSignature = signature
            prevMessage = messageHash


            
            await rfSale1Proxy.connect(merchant).claimTokens(merkleProof, messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(merchant.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(merchant.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[3]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < dealersArray.length; i++) {
            let dealer = dealersArray[i]
            let merkleProof = dealersTree.getHexProof(ethers.utils.keccak256(dealer.address))
            let prevRaiseAmount = await saleToken1.balanceOf(dealer.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [dealer.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(dealer).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(dealer).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash


            
            await rfSale1Proxy.connect(dealer).claimTokens(merkleProof, messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(dealer.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(dealer.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[3]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < brokersArray.length; i++) {
            let broker = brokersArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(broker.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [broker.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(broker).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(broker).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash


            
            await rfSale1Proxy.connect(broker).claimTokens([], messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(broker.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(broker.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[3]}`)).div(ethers.utils.parseEther("10000")))
        }

        for(i = 0; i < tycoonsArray.length; i++) {
            let tycoon = tycoonsArray[i]
            let prevRaiseAmount = await saleToken1.balanceOf(tycoon.address)


            let nonce = randomNumber(500, 10000)
            // Compute hash of the address
            let messageHash = ethers.utils.solidityKeccak256(
                ["address", "address", "uint256"],
                [tycoon.address, rfSale1Proxy.address, nonce]
            ).toString("hex");
            // console.log("Message Hash: ", messageHash);

            // Sign the hashed address
            let messageBytes = ethers.utils.arrayify(messageHash);
            let signature = await admin1.signMessage(messageBytes);
            // console.log("Signature: ", signature);


            if (i != 0) {
                await expect(
                    rfSale1Proxy.connect(tycoon).claimTokens([], messageHash, prevSignature)
                ).to.be.revertedWith("Signature is already used.")
                await expect(
                    rfSale1Proxy.connect(tycoon).claimTokens([], prevMessage, signature)
                ).to.be.revertedWith("Message hash is already used.")
            }

            prevSignature = signature
            prevMessage = messageHash


            
            await rfSale1Proxy.connect(tycoon).claimTokens([], messageHash, signature)
            let newRaiseAmount = await saleToken1.balanceOf(tycoon.address)
            let userInfo = await rfSale1Proxy.getUsersRegistryInfo(tycoon.address)

            expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(userInfo[2].mul(ethers.utils.parseEther(`${vestingPotions[3]}`)).div(ethers.utils.parseEther("10000")))
        }

        await rfSale1Proxy.getUserPortionsInfo(tycoonsArray[0].address)

    })

    it("isWhitelistRootHashSet returns true if root hashes are set", async () => {
        expect(await rfSale1Proxy.isWhitelistRootHashSet()).to.be.true
    })

    it("Sale owner can withdraw leftovertokens after first vesting period", async () => {
        await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10])
        await ethers.provider.send("evm_mine")

        let prevRaiseAmount = await saleToken1.balanceOf(saleOwner1.address)

        await rfSale1Proxy.connect(saleOwner1).withdrawLeftoverSaleTokens()

        let newRaiseAmount = await saleToken1.balanceOf(saleOwner1.address)

        expect(await rfSale1Proxy.amountOfSaleTokensDeposited()).to.equal(ethers.utils.parseEther(`${sale1FundAmount}`))

        expect(await rfSale1Proxy.amountOfSaleTokensSold()).to.equal(ethers.utils.parseEther(`${totalPurchases}`))

        // expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(ethers.utils.parseEther(`${sale1FundAmount - totalPurchases}`))
    })

    it("Onwer must be able to withdraw payment tokens raised", async () => {
        let prevRaiseAmount = await paymentToken.balanceOf(admin1.address)

        await rfSale1Proxy.connect(admin1).withdrawPaymentTokensRaised()

        let newRaiseAmount = await paymentToken.balanceOf(admin1.address)

        expect(newRaiseAmount.sub(prevRaiseAmount)).to.equal(await rfSale1Proxy.amountOfPaymentTokensRaised())
    })

})