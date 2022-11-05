// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Tier.sol";

enum StakingTime {
    Month,
    ThreeMonths,
    SixMonths,
    Year
}

/// @title Staking of the Raise Finance project. See https://raisefinance.io for more details
/// @author asimaranov
/// @notice Implements MasterChef-like staking with pools and tier-based rank system 
contract Staking is Ownable, Pausable {
    using SafeERC20 for IERC20;

    struct StakerInfo {
        uint8 allocationBonusPercent;
        bool isRegistered;
    }

    struct PoolStakerInfo {
        uint256 stake;
        uint256 stakedAt;
        uint256 deadline;
        uint256 rewardDebt;
    }

    struct PoolInfo {
        IERC20 token;
        uint256 allocPoints;
        uint256 lastRewardBlock;
        uint256 accRaisePerShare;
        uint256 balance;
    }

    /// @dev Will use only one EVM slot
    struct RequiredTierStakeInfo {
        uint32 fan;
        uint32 merchant;
        uint32 dealer;
        uint32 broker;
        uint32 tycoon;
    }

    struct StakerLotteryInfo {
        uint256 tickets;
        uint256 stakedAt;
        address user;
        uint8 allocationBonusPercent;
        uint8 tier;
    }

    IERC20 public raiseToken;
    PoolInfo[] public pools;
    mapping(address => StakerInfo) public stakers;
    mapping(uint256 => mapping(address => PoolStakerInfo)) public poolStakerInfos;  /// Pool id => staker id => staker info
    mapping(address => bool) public registeredTokens;
    RequiredTierStakeInfo public requiredTierStakeInfo;
    uint256 public totalAllocPoints;
    uint256 public raisePerBlock;
    uint256 public totalPenalties;
    uint256 public serviceBalance;
    uint8 public penaltyPercent;
    address[] public stakerAddresses;

    uint256 constant public RAISE_DECIMAL = 1e18;
    uint256 constant public TICKETS_PER_100_RAISE = 10;

    event Staked(address indexed user, uint256 indexed poolId, uint256 amount, uint256 reward, StakingTime time);
    event Unstaked(address indexed user, uint256 indexed poolId, uint256 amount, uint256 reward, bool withPenalty);
    event EmergencyUnstaked(address indexed user, uint256 indexed poolId, uint256 amount, bool withPenalty);
    event Claimed(address indexed user, uint256 indexed poolId, uint256 reward);
    event TierObtained(address indexed user, Tier tier);
    event Funded(address indexed user, uint256 amount);
    event Withdrawed(address indexed user, uint256 amount);
    event AllocationPointsSet(uint256 poolId, uint256 allocPoints);
    event PenaltyPercentSet(uint8 penaltyPercent_);
    event RaisePerBlockSet(uint256 newRaisePerBlock);

    constructor(address raiseTokenAddr, uint256 raisePerBlock_) {
        raiseToken = IERC20(raiseTokenAddr);
        raisePerBlock = raisePerBlock_;

        pools.push(PoolInfo({
            token: raiseToken,
            allocPoints: 1000,
            lastRewardBlock: block.number,
            accRaisePerShare: 0,
            balance: 0
        }));

        registeredTokens[raiseTokenAddr] = true;
        totalAllocPoints += 1000;
        penaltyPercent = 10;

        requiredTierStakeInfo = RequiredTierStakeInfo({
            fan: 333,
            merchant: 500,
            dealer: 5_000,
            broker: 50_000,
            tycoon: 100_000
        });
    }

    /// @notice Creates a new staking pool for token `tokenAddr` with `allocPoints_` allocation points
    /// @param allocPoints_ Allocation points for the pool: the weight of the pool in pools reward distribution
    /// @param tokenAddr Address of the pool token
    function createPool(uint256 allocPoints_, address tokenAddr) public onlyOwner {
        require(!registeredTokens[tokenAddr], "Such pool already created");
        
        registeredTokens[tokenAddr] = true;
        totalAllocPoints += allocPoints_;

        pools.push(PoolInfo({
            token: IERC20(tokenAddr),
            allocPoints: allocPoints_,
            lastRewardBlock: block.number,
            accRaisePerShare: 0,
            balance: 0
        }));
    }
    /// @notice Updates pool reward info
    /// @dev Should be called before operations with pool balance
    /// @param poolId Id of the pool to update
    function updatePool(uint256 poolId) public whenNotPaused {
        PoolInfo storage poolInfo = pools[poolId];
        if (block.number <= poolInfo.lastRewardBlock) 
            return;
        
        uint256 poolBalance = poolInfo.balance;
        uint256 raiseReward;

        if (poolBalance > 0) {
            raiseReward = raisePerBlock * (block.number - poolInfo.lastRewardBlock) * poolInfo.allocPoints / totalAllocPoints;
            poolInfo.accRaisePerShare += raiseReward * 1e12 / poolBalance;
        }

        poolInfo.lastRewardBlock = block.number;
    }

    /// @notice Called by users to stake token to a specific pool
    /// @param poolId Id of the pool
    /// @param amount Amount to stake
    /// @param time Staking period
    function stake(uint256 poolId, uint256 amount, StakingTime time) public whenNotPaused {
        require(amount > 0, "Unable to stake 0 tokens");

        StakerInfo storage stakerInfo = stakers[msg.sender];
        PoolStakerInfo storage poolStakerInfo = poolStakerInfos[poolId][msg.sender];
        PoolInfo storage poolInfo = pools[poolId];

        updatePool(poolId);

        uint256 totalUserReward = poolStakerInfo.stake * poolInfo.accRaisePerShare / 1e12;
        uint256 pending;

        if (poolStakerInfo.stake > 0) {
            pending = totalUserReward - poolStakerInfo.rewardDebt;

            if (pending > 0) {
                require(serviceBalance >= pending, "Service balance is empty");

                serviceBalance -= pending;
                raiseToken.safeTransfer(msg.sender, pending);

                emit Claimed(msg.sender, poolId, pending);
            }
        }

        if (poolId == 0) {
            uint256 previousStake = poolStakerInfo.stake;
            Tier previousTier = getTierByStakingAmount(previousStake);
            Tier newTier = getTierByStakingAmount(previousStake + amount);

            if (newTier > previousTier)
                emit TierObtained(msg.sender, newTier);
        }

        poolStakerInfo.stake += amount;
        poolStakerInfo.rewardDebt = poolStakerInfo.stake * poolInfo.accRaisePerShare / 1e12;
        
        if (!stakerInfo.isRegistered) {
            stakerAddresses.push(msg.sender);
            stakerInfo.isRegistered = true;
            poolStakerInfo.stakedAt = block.timestamp;
        }

        uint256 newDeadline = block.timestamp + getPeriodDuration(time);

        if (newDeadline > poolStakerInfo.deadline) {
            poolStakerInfo.deadline = newDeadline;

            if (poolId == 0) 
                stakerInfo.allocationBonusPercent = getAllocationBonusPercentByTime(time);  // If user stake deadline increased, we'd recalculate the alloc bonus
        }

        poolInfo.balance += amount;
        poolInfo.token.safeTransferFrom(msg.sender, address(this), amount);
        
        emit Staked(msg.sender, poolId, amount, pending, time);
    }

    /// @notice Called by users to unstake token from a specific pool
    /// @param poolId Id of the pool
    /// @param amount Amount to stake
    function unstake(uint256 poolId, uint256 amount) public whenNotPaused {
        PoolStakerInfo storage poolStakerInfo = poolStakerInfos[poolId][msg.sender];

        require(poolStakerInfo.stake >= amount, "Not enough balance");

        updatePool(poolId);
        
        PoolInfo storage poolInfo = pools[poolId];
        poolInfo.balance -= amount;

        uint256 totalUserReward = poolStakerInfo.stake * poolInfo.accRaisePerShare / 1e12;
        uint256 pending = totalUserReward - poolStakerInfo.rewardDebt;
        bool withPenalty;
        uint256 amountToUnstake = amount;

        Tier previousTier = getTierByStakingAmount(poolStakerInfo.stake);

        if (block.timestamp < poolStakerInfo.deadline && poolId == 0 && previousTier >= Tier.Merchant) {
            uint256 penalty = amount * penaltyPercent / 100;
            amountToUnstake -= penalty;
            serviceBalance += penalty;
            totalPenalties += penalty;
            withPenalty = true;
        }
        
        if (pending > 0) {
            require(serviceBalance >= pending, "Service balance is empty");
            
            serviceBalance -= pending;
            raiseToken.safeTransfer(msg.sender, pending);

            emit Claimed(msg.sender, poolId, pending);
        }

        poolStakerInfo.stake -= amount;
        poolStakerInfo.rewardDebt = poolStakerInfo.stake * poolInfo.accRaisePerShare / 1e12;

        if (poolId == 0) {
            Tier tierToAcquire = getTierByStakingAmount(poolStakerInfo.stake);

            if (tierToAcquire < previousTier) {
                poolStakerInfo.stakedAt = block.timestamp;  // If tier decreased, we'll reset the stake time
                emit TierObtained(msg.sender, tierToAcquire);
            }
        }

        poolInfo.token.safeTransfer(msg.sender, amountToUnstake);

        emit Unstaked(msg.sender, poolId, amountToUnstake, pending, withPenalty);
    }

    /// @notice Called by users to unstake token from a specific pool in case of emergency. Drops the stake reward
    /// @param poolId Id of the pool
    function emergencyUnstake(uint256 poolId) public whenNotPaused {
        PoolStakerInfo storage poolStakerInfo = poolStakerInfos[poolId][msg.sender];
        uint256 amount = poolStakerInfo.stake;
        
        require(amount > 0, "Not enough balance");

        PoolInfo storage poolInfo = pools[poolId]; 
        poolInfo.balance -= amount;
        
        bool withPenalty;
        uint256 amountToUnstake = amount;
        Tier currentTier = getTierByStakingAmount(poolStakerInfo.stake);

        if (block.timestamp < poolStakerInfo.deadline && poolId == 0 && currentTier >= Tier.Merchant) {
            uint256 penalty = amount * penaltyPercent / 100;
            amountToUnstake -= penalty;
            serviceBalance += penalty; 
            totalPenalties += penalty;
            withPenalty = true;
        }
        
        poolStakerInfo.stake = 0;
        poolStakerInfo.rewardDebt = 0;
        poolInfo.token.safeTransfer(msg.sender, amountToUnstake);

        emit EmergencyUnstaked(msg.sender, poolId, amountToUnstake, withPenalty);
    }

    /// @notice Called by users to collect the staking reward from a specific pool
    /// @param poolId Id of the pool
    function claim(uint256 poolId) public whenNotPaused {
        updatePool(poolId);

        PoolStakerInfo storage poolStakerInfo = poolStakerInfos[poolId][msg.sender];
        PoolInfo memory poolInfo = pools[poolId];
        uint256 totalUserReward = poolStakerInfo.stake * poolInfo.accRaisePerShare / 1e12;
        uint256 pending = totalUserReward - poolStakerInfo.rewardDebt;

        require(pending > 0, "No reward to claim");
        require(serviceBalance >= pending, "Service balance is empty");
        
        serviceBalance -= pending;
        poolStakerInfo.rewardDebt = totalUserReward;
        raiseToken.safeTransfer(msg.sender, pending);

        emit Claimed(msg.sender, poolId, pending);
    }

    /// @notice Funds the service with raise token
    /// @param amount Amount to fund
    function fund(uint256 amount) public {
        serviceBalance += amount;
        raiseToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Funded(msg.sender, amount);
    }

    /// @notice Withdraws raise token from the service
    /// @param amount Amount to withdraw
    function withdraw(uint256 amount) public onlyOwner {
        require(serviceBalance >= amount, "Not enough service balance");

        serviceBalance -= amount;
        raiseToken.safeTransfer(msg.sender, amount);

        emit Withdrawed(msg.sender, amount);
    }

    /// @notice Changes allocation points for a specific pool
    /// @param poolId Pool to change points
    /// @param allocPoints Allocation points to set
    function setAllocPoints(uint256 poolId, uint256 allocPoints) public onlyOwner {
        pools[poolId].allocPoints = allocPoints;
        emit AllocationPointsSet(poolId, allocPoints);
    }

    /// @notice Sets penalty for early unstake fee percent
    /// @param penaltyPercent_ The new penalty percent
    function setPenaltyPercent(uint8 penaltyPercent_) public onlyOwner {
        penaltyPercent = penaltyPercent_;
        emit PenaltyPercentSet(penaltyPercent_);
    }

    /// @notice Sets amount of raise token staking collects after one block passed 
    /// @param newRaisePerBlock New raise per block amount to set
    function setRaisePerBlock(uint256 newRaisePerBlock) public onlyOwner {
        raisePerBlock = newRaisePerBlock;
        emit RaisePerBlockSet(newRaisePerBlock);
    }

    /// @notice Sets required stake to get a tier
    /// @param tier Tier to change required stake for
    /// @param requiredStake Required stake to get a tier
    function setRequiredStakeForTier(Tier tier, uint32 requiredStake) public onlyOwner {
        if (tier == Tier.Fan) requiredTierStakeInfo.fan = requiredStake;
        else if (tier == Tier.Merchant) requiredTierStakeInfo.merchant = requiredStake;
        else if (tier == Tier.Dealer) requiredTierStakeInfo.dealer = requiredStake;
        else if (tier == Tier.Broker) requiredTierStakeInfo.broker = requiredStake;
        else if (tier == Tier.Tycoon) requiredTierStakeInfo.tycoon = requiredStake;
    }

    /// @notice Pauses the contract in case of emergency
    function pause() public onlyOwner {
        _pause();
    }

    /// @notice Unpauses the contract
    function unpause() public onlyOwner {
        _unpause();
    }

    /// @notice User stake info in a specific pool
    /// @param poolId The pool id
    /// @param user User address
    function getUserStakeInfo(uint256 poolId, address user) public view returns (uint256 amount, uint256 deadline) {
        PoolStakerInfo memory stakerInfo = poolStakerInfos[poolId][user];
        amount = stakerInfo.stake;
        deadline = stakerInfo.deadline;
    }

    /// @notice User pending reward in a pool
    /// @param poolId Id of the pool
    /// @param user User address
    function getPendingReward(uint256 poolId, address user) public view returns (uint256 pendingReward) {
        PoolStakerInfo memory poolStakerInfo = poolStakerInfos[poolId][user];
        PoolInfo memory poolInfo = pools[poolId];

        uint256 accRaisePerShare = poolInfo.accRaisePerShare;
        uint256 poolBalance = poolInfo.balance;

        if (block.number > poolInfo.lastRewardBlock && poolBalance > 0) {
            uint256 raiseReward = raisePerBlock * (block.number - poolInfo.lastRewardBlock) * poolInfo.allocPoints / totalAllocPoints;
            accRaisePerShare += raiseReward * 1e12 / poolBalance;
        }

        pendingReward = poolStakerInfo.stake * accRaisePerShare / 1e12 - poolStakerInfo.rewardDebt;
    }

    /// @notice User info that includes tickets, tier etc
    /// @param user User address
    function getUserInfo(address user)
        public view 
        returns (
            uint256 userTickets, 
            Tier tier,
            uint256 stake_, 
            uint256 deadline, 
            uint8 allocationBonusPercent,
            uint256 stakedAt
        ) 
    {
        PoolStakerInfo memory poolStakerInfo = poolStakerInfos[0][user];
        StakerInfo memory staker = stakers[user];
        Tier userTier = getTierByStakingAmount(poolStakerInfo.stake);

        if (userTier == Tier.Fan || userTier == Tier.Merchant || userTier == Tier.Dealer)
            userTickets = poolStakerInfo.stake * TICKETS_PER_100_RAISE / (100 * RAISE_DECIMAL);
        
        tier = userTier;
        stake_ = poolStakerInfo.stake;
        deadline = poolStakerInfo.deadline;
        stakedAt = poolStakerInfo.stakedAt;
        allocationBonusPercent = staker.allocationBonusPercent;
    }

    /// @notice Fetches info about registered users
    /// @param registeredUsers Users to fetch info about
    function getStakerLotteryInfos(address[] calldata registeredUsers) public view returns (StakerLotteryInfo[] memory userInfos) {
        userInfos = new StakerLotteryInfo[](registeredUsers.length);

        for (uint i = 0; i < registeredUsers.length; i++) {
            (uint256 userTickets, Tier tier, , , uint8 allocationBonusPercent, uint256 stakedAt) = getUserInfo(registeredUsers[i]);
            userInfos[i].tickets = userTickets;
            userInfos[i].stakedAt = stakedAt;
            userInfos[i].user = registeredUsers[i];
            userInfos[i].allocationBonusPercent = allocationBonusPercent;
            userInfos[i].tier = uint8(tier);
        }
    }

    /// @notice Pool balance
    /// @param poolId Id of the pool
    function getStakedTokenAmount(uint256 poolId) public view returns (uint256) {
        return pools[poolId].balance;
    }

    /// @notice Calculates tier by stake
    /// @param amount Stake amount
    function getTierByStakingAmount(uint256 amount) public view returns (Tier tier) {
        return _getTierByStakingAmount(requiredTierStakeInfo, amount);
    }

    /// @notice Converts duration to a timestamp
    /// @param time Duration enum item
    function getPeriodDuration(StakingTime time) public pure returns (uint256 period) {
        if (StakingTime.Month == time) return 30 days;
        if (StakingTime.ThreeMonths == time) return 30 days * 3;
        if (StakingTime.SixMonths == time) return 30 days * 6;

        return 30 days * 12;
    }

    /// @notice Calculates allocation bonus for stake time
    /// @param time Duration enum item
    function getAllocationBonusPercentByTime(StakingTime time) public pure returns (uint8) {
        if (StakingTime.Month == time) return 0;
        if (StakingTime.ThreeMonths == time) return 10;
        if (StakingTime.SixMonths == time) return 20;

        return 30;
    }

    function _getTierByStakingAmount(RequiredTierStakeInfo memory requiredTierStakeInfo_, uint256 amount) internal pure returns (Tier tier) {
        if (amount < requiredTierStakeInfo_.fan * RAISE_DECIMAL) return Tier.None;
        if (amount < requiredTierStakeInfo_.merchant * RAISE_DECIMAL) return Tier.Fan;
        if (amount < requiredTierStakeInfo_.dealer * RAISE_DECIMAL) return Tier.Merchant;
        if (amount < requiredTierStakeInfo_.broker * RAISE_DECIMAL) return Tier.Dealer;
        if (amount < requiredTierStakeInfo_.tycoon * RAISE_DECIMAL) return Tier.Broker;

        return Tier.Tycoon;
    }
}