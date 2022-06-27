// SPDX-License-Identifier: MIT
/**
    @title RFAllocationStaking
    @author farruhsydykov
 */
pragma solidity ^0.8.0;

import "./interfaces/IAdmin.sol";
import "./interfaces/IRFSaleFactory.sol";
import "./interfaces/IRFAllocationStaking.sol";

import "./UpgradeableUtils/PausableUpgradeable.sol";
import "./UpgradeableUtils/ReentrancyGuardUpgradeable.sol";
import "./UpgradeableUtils/SafeERC20Upgradeable.sol";

contract RFAllocationStaking is IRFAllocationStaking, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct TierInfo {
        Tier tier; // Current tier level.
        uint256 amount; // Total amount of RAISE staked.
        uint256 tokensUnlockTime; // When tokens will be available for withdrawal after participation in a sale.
    }

    struct UserInfo {
        uint256 amount; // How many LP/RAISE tokens the user has provided.
        uint256 claimedReward; // Amount of tokens user has already claimed.
        uint256 lastRAISEStake; // Timesatmp when RAISE were staked.
        uint256 firstRAISEStake; // Timestamp when RAISE tokens were staked in RAISE pool for the first time.
    }

    struct PoolInfo {
        IERC20Upgradeable lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. ERC20s to distribute per second.
        uint256 lastRewardTimestamp; // Last timstamp that ERC20s distribution occurs.
        uint256 accERC20PerShare; // Accumulated ERC20s per share, times 1e36.
        uint256 totalDeposits; // Total amount of tokens deposited at the moment (staked).
        uint256 minStakingPeriod; // Minimal time period of staking. Unstaking earlier will bear a fee
    }

    struct TierUpgradePool {
        StakeStatus status; // Status of the Stake To Upgrade pool.
        Tier upgradeFrom; // User's Tier to upgrade from.
        uint256 amount; // Amount of tokens staked in STU.
        uint256 lastTierChange; // Last timestamp when tier was changed.
    }

    // Admin contract address.
    IAdmin public admin;
    // Address of the RAISE Token contract.
    IERC20Upgradeable public RAISE;
    // Total amount of RAISE staked in this contract
    uint256 public totalRAISEDeposited;
    // The timestamp when farming starts.
    uint256 public startTimestamp;
    // The timestamp when farming ends.
    uint256 public endTimestamp;
    // RAISE tokens rewarded per second.
    uint256 public rewardPerSecond;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint;

    // The total amount of RAISE that's paid out as reward.
    uint256 public paidOut;
    // Total rewards added to farm.
    uint256 public totalRewards;
    // Address of sales factory contract.
    IRFSaleFactory public salesFactory;
    // Fee for early unstaking. Should be set as 100 for 1%.
    uint256 public earlyUnstakingFee;
    // Early unstaking fee precision. Will be set as 10,000 while initialisation.
    uint256 public earlyUnstakingFeePrecision;
    // Total RAISE taken back as a staking reward for premature withdrawal.
    uint256 public RAISEReturnedForStakingReward;
    // Seconds amount in 6 months. Set during initialization.
    uint32 private sixMonthPeriod;
    // Seconds amount in 12 months. Set during initialization.
    uint32 private twelveMonthPeriod;
    // Mminimum amount of time passed staking to be elligible for FAN round participation. Set during initialization.
    uint32 private minStakingPeriodForFANParticipation;
    // Amount of tokens required to get one ticket. Set as a whole token i.e. 1 - right, 1 000 000 000 000 000 000 - wrong.
    uint256 public tokensPerTicket;
    // 1e36 used as precision for calculating user's reward.
    uint256 public precisionConstant;
    // 10 ** 18 set during initialization.
    uint256 ONE;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Mapping to check if a given _pid is RAISE pool
    mapping(uint256 => bool) public isRAISEPool;
    // Info of each user that stakes RAISE
    mapping(address => TierInfo) public tierInfo;
    // Info of user's STU pool.
    mapping(address => TierUpgradePool) public upgradePool;
    // Info of each user's stake in a given pool.
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;
    
    // * * * EVENTS * * * //
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount, uint256 feeTaken);
    event rewardsWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    
    // * * * MODIFIERS * * * //
    /**
        @dev Checks if the caller is a verified sale factory.
     */
    modifier onlyVerifiedSales {
        require(salesFactory.isSaleCreatedThroughFactory(_msgSender()), "RF_SA: Sale not created through factory.");
        _;
    }

    /**
        @dev Checks if the caller is a verified sale factory.
     */
    modifier onlyAdmin {
        require(admin.isAdmin(_msgSender()), "Only Admin can deploy sales");
        _;
    }

    /**
        @dev Checks if given _pid is a valid pool id.
     */
    modifier onlyValidPoolID(uint256 _pid) {
        bool inPoolInfo = _pid >= 0 && _pid < poolInfo.length;
        require(inPoolInfo || _pid == 999999, "RF_SA: There is no pool with such pool ID");
        _;
    }

    // * * * INITIALIZER * * * //

    /**
        @dev Contract initializer.
        @param _erc20 Address of the token that will be used as a reward for staking and will be used to calculate user's tier.
        @param _rewardPerSecond Reward per second value:
        @param _startTimestamp When rewards will start caclulating.
        @param _earlyUnstakingFee Fee for early unstaking. Should be set as 100 per 1%. i.e. 5000 for 50%.
        @param _salesFactory Address of the sales factory that will request user's tier or ticket amount.
        @param _tokensPerTicket Amount of tokens require to get one ticket. Set as a whole token i.e. 1 - right, 1 000 000 000 000 000 000 - wrong.
        @param _admin Admin contract address.
     */
    function initialize(
        address _erc20,
        uint256 _rewardPerSecond,
        uint256 _startTimestamp,
        uint256 _earlyUnstakingFee,
        address _salesFactory,
        uint256 _tokensPerTicket,
        address _admin
    )
    external
    initializer
    {
        require(IAdmin(_admin).isAdmin(_msgSender()), "Only Admin can initialize this contract");
        __Pausable_init_unchained();
        __ReentrancyGuard_init_unchained();

        RAISE = IERC20Upgradeable(_erc20);
        rewardPerSecond = _rewardPerSecond;
        startTimestamp = _startTimestamp;
        endTimestamp = _startTimestamp;
        earlyUnstakingFee = _earlyUnstakingFee;
        salesFactory = IRFSaleFactory(_salesFactory);
        tokensPerTicket = _tokensPerTicket;

        admin = IAdmin(_admin);
        ONE = 1000000000000000000;
        precisionConstant = 1e36;
        earlyUnstakingFeePrecision = 10000;
        sixMonthPeriod = 180 * 24 * 60 * 60;
        twelveMonthPeriod = 360 * 24 * 60 * 60;
        minStakingPeriodForFANParticipation = 14 * 24 * 60 * 60;
    }

    // * * * EXTERNAL FUNCTIONS * * * //

    /**
        @dev Function to pause the contract.
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
        @dev Function to unpause the contract.
     */
    function unpause() external onlyAdmin {
        _unpause();
    }

    /**
        @dev Sets new value of rewardPerSecond.
        @param _newRewardPerSecond New rewardPerSecond value.
     */
    function setRewardPerSecond(uint256 _newRewardPerSecond) override virtual external onlyAdmin {
        require(totalRewards != 0, "RF_SA: This contract is not funded or has not been initialized yet.");

        rewardPerSecond = _newRewardPerSecond;
        endTimestamp = block.timestamp + (totalRewards - paidOut) / rewardPerSecond;

        require(endTimestamp > block.timestamp, "RF_SA: New rewardPerSecond value would lead to an end of staking.");
    }

    /**
        @dev Sets new ealyUnstakingFee. Should be set as 100 for 1% fee.
        @param _newEarlyUnstakingFee New early unstaking fee.
     */
    function setEarlyUnstakingFee(uint256 _newEarlyUnstakingFee) override virtual external onlyAdmin {
        require(_newEarlyUnstakingFee < 10000, "RF_SA: Early unstaking fee can not be bigger than 100%.");

        earlyUnstakingFee = _newEarlyUnstakingFee;
    }

    /**
        @dev Function where owner can set sales factory in case of upgrading some of smart-contracts.
        @param _salesFactory Address of the new sales factory.
     */
    function setSalesFactory(address _salesFactory) override virtual external onlyAdmin {
        require(_salesFactory != address(0), "RF_SA: Sales Factory address is already set.");
        salesFactory = IRFSaleFactory(_salesFactory);
    }

    /**
        @dev Add a new lp to the pool. Can only be called by the owner.
        @param _allocPoint Allocation point amount of the new pool.
        @param _lpToken Address of the lpToken
        @param _minStakingPeriod Minimal staking period for RAISE pools.
        Withdrawing ealier than that will bear an early unstaking fee.
        @param _withUpdate Update or not to update pools.
     */
    function add(uint256 _allocPoint, address _lpToken, uint256 _minStakingPeriod, bool _withUpdate) override virtual external onlyAdmin {
        if (_withUpdate) {
            massUpdatePools();
        }

        uint256 __minStakingPeriod;
        if (IERC20Upgradeable(_lpToken) == RAISE) __minStakingPeriod = _minStakingPeriod;

        uint256 lastRewardTimestamp = block.timestamp > startTimestamp ? block.timestamp : startTimestamp;
        totalAllocPoint = totalAllocPoint + _allocPoint;
        poolInfo.push(PoolInfo({
            lpToken: IERC20Upgradeable(_lpToken),
            allocPoint: _allocPoint,
            lastRewardTimestamp: lastRewardTimestamp,
            accERC20PerShare: 0,
            totalDeposits: 0,
            minStakingPeriod: __minStakingPeriod
        }));

        // In case of adding new pool for RAISE staking
        // Save its _pid in a map to check if it's RAISE pool.
        if (IERC20Upgradeable(_lpToken) == RAISE) {
            uint256 pId_ = poolInfo.length - 1;
            isRAISEPool[pId_] = true;
        }
    }

    /**
        @dev Deposit LP or RAISE tokens to farm for RAISE rewards, tier or tickets.
        @param _pid Id of the pool in which to deposit.
        @param _amount Amount of tokens user is depositing.
     */
    function deposit(uint256 _pid, uint256 _amount) override virtual external onlyValidPoolID(_pid) whenNotPaused {
        // massUpdatePools();
        require(_amount > 0, "RF_SA: Amount to deposit can not be 0");

        if (_pid == 999999) {
            _stakeRAISEForUpgrades(_amount);
        } else _stakeLP(_pid, _amount);
    }

    /**
        @dev Update the given pool's ERC20 allocation point and/or minimal staking period. Can only be called by the owner.
        @param _pid Pool's id.
        @param _allocPoint Allocation point amount of the new pool.
        @param _minStakingPeriod Minimal staking period for RAISE pools.
        Withdrawing ealier than that will bear an early unstaking fee.
        @param _withUpdate Update or not to update pools.
     */
    function set(uint256 _pid, uint256 _allocPoint, uint256 _minStakingPeriod, bool _withUpdate) override virtual external onlyAdmin onlyValidPoolID(_pid) {
        if (_withUpdate) massUpdatePools();

        PoolInfo storage pool = poolInfo[_pid];
        if (pool.lpToken == RAISE && _minStakingPeriod != 0) pool.minStakingPeriod = _minStakingPeriod;

        totalAllocPoint = totalAllocPoint - poolInfo[_pid].allocPoint + _allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    /**
        @dev Returns number of liquidity pool exluding stake to upgrade pool.
     */
    function poolLength() override virtual external view returns (uint256) {
        return poolInfo.length;
    }

    /**
        @dev Function to fetch deposits and earnings at one call for multiple users for passed pool id.
        @param _users An array of addresses who's deposits and pending amounts to return.
        @param _pid Pool id of which to return deposits and pending amounts.
     */
    function getPendingAndDepositedForUsers(
        address[] memory _users,
        uint _pid
    )
    override
    virtual
    external
    view
    whenNotPaused
    onlyValidPoolID(_pid) 
    returns (uint256 [] memory , uint256 [] memory) {
        uint256 [] memory deposits = new uint256[](_users.length);
        uint256 [] memory earnings = new uint256[](_users.length);

        for(uint i=0; i < _users.length; i++) {
            deposits[i] = deposited(_pid , _users[i]);
            earnings[i] = pendingReward(_pid, _users[i]);
        }

        return (deposits, earnings);
    }

    /**
        @dev View function for total reward the farm has yet to pay out.
        @notice This is not necessarily the sum of all pending sums on all pools and users.
                example 1: when tokens have been wiped by emergency withdraw.
                example 2: when one pool has no LP supply.
     */
    function totalPending() override virtual external view whenNotPaused returns(uint256) {
        if (block.timestamp <= startTimestamp) {
            return 0;
        }

        uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;
        return rewardPerSecond * (lastTimestamp - startTimestamp) - paidOut;
    }
    
    /**
        @dev Sets RAISE token unlock time for a given user by verified sales. Meaning that while the user
        participates in a sale that has not yet ended he/she can not withdraw RAISE tokens.
        @param _user Address of the user who's tokens will be locked.
        @param _tokensUnlockTime Timestamp when tokens will be unlocked.
     */
    function setTokensUnlockTime(
        address _user,
        uint256 _tokensUnlockTime
    )
    override
    virtual
    external
    onlyVerifiedSales{
        TierInfo storage tier = tierInfo[_user];

        tier.tokensUnlockTime = _tokensUnlockTime;
    }

    /**
        @dev Fund the farm, increase the end block.
        @param _amount Token amount to fund the farm for.
     */
    function fund(uint256 _amount) override virtual external {
        require(block.timestamp < endTimestamp && endTimestamp != 0, "RF_SA: too late, the farm is closed or contract was not yet initialized.");
        RAISE.safeTransferFrom(_msgSender(), address(this), _amount);
        endTimestamp += _amount / rewardPerSecond;
        totalRewards += _amount;
    }

    /**
        @dev Function to set amount of tokens required to get a ticket.
        @param _amount Amount of tokens required to get a ticket.
     */
    function setTokensPerTicket(uint256 _amount) override virtual external onlyAdmin {
        require(_amount != 0, "RF_SA: New value for `tokensPerTicket` can not be zero.");
        tokensPerTicket = _amount;
    }

    /**
        @dev Function to check if user has staked for at least 2 weeks.
        @param _user Address of the user whos staking period is checked.
     */
    function fanStakedForTwoWeeks(address _user) override virtual external view whenNotPaused returns(bool isStakingRAISEForTwoWeeks_) {
        require(getCurrentTier(_user) == Tier.FAN, "RF_SA: This user is not FAN.");

        // bool isStakingRAISEForTwoWeeks;

        uint256 timePassed;
        for (uint256 i = 0; i < poolInfo.length; i++) {
            UserInfo storage user = userInfo[i][_user];
            timePassed = block.timestamp - user.firstRAISEStake;
            if (poolInfo[i].lpToken == RAISE && timePassed > minStakingPeriodForFANParticipation && user.firstRAISEStake != 0) return true;
        }
        return false;
    }

    // * * * PUBLIC FUNCTIONS * * * //

    /**
        @dev Update reward variables for all pools.
     */
    function massUpdatePools() override virtual public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    /**
        @dev Update reward variables of the given pool to be up-to-date.
        @param _pid Id of the pool which should be upgraded.
     */
    function updatePool(uint256 _pid) override virtual public onlyValidPoolID(_pid) {
        PoolInfo storage pool = poolInfo[_pid];
        
        // check if rewards can still be calculated
        // when block.timestamp < endTimestamp it means that
        // this contract has run out of funds for rewards
        uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;
        
        if (lastTimestamp <= pool.lastRewardTimestamp) {
            return;
        }
        
        uint256 lpSupply = pool.totalDeposits;

        // if there are not tokens staked in the pool
        // then update lastRewardTimestamp and return 
        if (lpSupply == 0) {
            pool.lastRewardTimestamp = lastTimestamp;
            return;
        }
        
        // calculate number of seconds since lastRewardTimestamp
        // when reward was calculated last time
        uint256 nrOfSeconds = block.timestamp - pool.lastRewardTimestamp;
        // determine how much tokens are devoted to this pool
        uint256 RAISERewardOfThePool = nrOfSeconds * rewardPerSecond * pool.allocPoint / totalAllocPoint;
        // calculate how many reward tokens are given for each token staked in this pool    
        pool.accERC20PerShare += (RAISERewardOfThePool * precisionConstant / lpSupply);
        pool.lastRewardTimestamp = lastTimestamp;
    }

    /**
        @dev View function to see deposited LP for a user.
        @param _pid Id of the pool in which to check user's deposited amount.
        @param _user Address of the user whos deposited amount is requested.
     */
    function deposited(uint256 _pid, address _user) override virtual public view whenNotPaused onlyValidPoolID(_pid) returns(uint256) {
        UserInfo storage user = userInfo[_pid][_user];
        return user.amount;
    }

    /**
        @dev View function to see pending amount for a user.
        @param _pid Id of the pool in which to check user's pending amount.
        @param _user Address of the user whos pending amount is requested.
     */
    function pendingReward(uint256 _pid, address _user) override virtual public view whenNotPaused onlyValidPoolID(_pid) returns(uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user]; 

        uint256 accERC20PerShare = pool.accERC20PerShare;
        uint256 lpSupply = pool.totalDeposits;

        if (block.timestamp > pool.lastRewardTimestamp && lpSupply != 0) {
            uint256 reward = rewardPerSecond * pool.allocPoint / totalAllocPoint;
            accERC20PerShare += reward * precisionConstant / lpSupply;
        }
        return user.amount * accERC20PerShare / precisionConstant - user.claimedReward;
    }

    /**
        @dev Function to withdraw LP or RAISE tokens from a given pool.
        @param _pid Id of the pool to withdraw tokens from.
        @param _amount Amount of tokens to withdraw.
     */
    function withdraw(uint256 _pid, uint256 _amount) override virtual public onlyValidPoolID(_pid) nonReentrant whenNotPaused {
        // massUpdatePools();
        // check if user participate in a sale and his tokens are locked
        if (isRAISEPool[_pid] || _pid == 999999) {
            require(
                block.timestamp > tierInfo[_msgSender()].tokensUnlockTime,
                "RF_SA: Your RAISE tokens are locked due to sale participation"
            );
        }

        if (_pid == 999999) {
            _withdrawFromUpgrades();
        } else _withdrawLP(_pid, _amount);
    }

    /**
        @dev Function to withdraw pending rewards.
        @param _pid Id of the pool to withdraw pending rewards from.
     */
    function withdrawPending(uint256 _pid) override virtual public onlyValidPoolID(_pid) whenNotPaused {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_msgSender()];

        require(_pid != 999999, "RF_SA: There are no rewards from staking in 'Stake To Upgrade' pool");

        uint256 pending;
        if (user.amount > 0) {
            pending = user.amount * pool.accERC20PerShare / precisionConstant - user.claimedReward;
        } else return;

        user.claimedReward = user.amount * pool.accERC20PerShare / precisionConstant;

        if(pending > 0) {
            paidOut += pending;
            pool.lpToken.safeTransfer(_msgSender(), pending);
        }

        emit rewardsWithdraw(_msgSender(), _pid, pending);
    }

    /**
        @dev Function to calculate ticket amount of the given user.
        @param _user Address whos ticket amount to calculate
     */
    function getTicketAmount(address _user) override virtual public view whenNotPaused returns(uint256 ticketAmount_) {
        TierInfo storage info = tierInfo[_user];
        Tier tier = getCurrentTier(_user);
        
        require(tier < Tier.BROKER && tier > Tier.FAN, "RF_SA: Brokers, Tycoons and Fans are not elligible for tickets");

        ticketAmount_ = info.amount / (tokensPerTicket * ONE);
    }

    /**
        @dev Public function to get user's tier taking in consideration his/her upgrades.
        @param _user Address of the user whos tier is requested.
        @notice Tier might be outdated! Make sure to check for upgrades first.
     */
    function getCurrentTier(address _user) override virtual public view whenNotPaused returns(Tier tier) {
        TierInfo storage user = tierInfo[_user];
        TierUpgradePool storage stu = upgradePool[_user];

        uint256 timePassed;
        if (stu.lastTierChange != 0) {
            timePassed = block.timestamp - stu.lastTierChange;
        } else timePassed = 0;
        uint256 amountStaked = user.amount;

        require(amountStaked > 0, "RF_SA: This user does not stake any RAISE");

        if (amountStaked < 500 * ONE) return Tier.FAN;
        if (amountStaked >= 500 * ONE && amountStaked < 5000 * ONE) {
            if (timePassed >= twelveMonthPeriod + twelveMonthPeriod) return Tier.TYCOON;
            else if (timePassed >= twelveMonthPeriod) return Tier.BROKER;
            else if (timePassed >= sixMonthPeriod) return Tier.DEALER;
            else return Tier.MERCHANT;
        }
        if (amountStaked >= 5000 * ONE && amountStaked < 50000 * ONE) {
            if (timePassed >= twelveMonthPeriod + sixMonthPeriod) return Tier.TYCOON;
            else if (timePassed >= sixMonthPeriod) return Tier.BROKER;
            else return Tier.DEALER;
        }
        if (amountStaked >= 50000 * ONE && amountStaked < 100000 * ONE) {
            if (timePassed >= twelveMonthPeriod) return Tier.TYCOON;
            else return Tier.BROKER;
        }
        if (amountStaked >= 100000 * ONE) return Tier.TYCOON;
    }

    // * * * INTERNAL FUNCTIONS * * * //

    /**
        @dev Internal function to stake LP or RAISE tokens.
        @param _pid Id of the pool to which to stake tokens.
        @param _amount Amount of tokens to stake.
     */
    function _stakeLP(uint256 _pid, uint256 _amount) virtual internal {
        massUpdatePools();
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_msgSender()];
        TierInfo storage tier = tierInfo[_msgSender()];
        TierUpgradePool storage stu = upgradePool[_msgSender()];

        uint256 depositAmount = _amount;        

        Tier prevTier = stu.upgradeFrom;

        pool.lpToken.safeTransferFrom(address(_msgSender()), address(this), _amount);
        pool.totalDeposits += depositAmount;

        uint256 pending;
        if (user.amount > 0) {
            pending = user.amount * pool.accERC20PerShare / precisionConstant - user.claimedReward;
        }

        uint256 prevUserAmount = user.amount;
        user.amount += depositAmount;

        user.claimedReward = user.amount * pool.accERC20PerShare / precisionConstant;

        // If token staked is RAISE:
        if (pool.lpToken == RAISE) {
            // if RAISE tokens are staked for the first time in this pool
            // set firstRAISEStake as a current timestamp
            if (prevUserAmount == 0) {
                user.firstRAISEStake = block.timestamp;
            }
            // Increase users RAISE amount staked
            tier.amount += _amount;
            // Upgrade tier
            tier.tier = getCurrentTier(_msgSender());
            // Each new stake to RAISE pool updates user's lastRAISEStake
            user.lastRAISEStake = block.timestamp;
            // Increase total RAISE deposited to this contract
            totalRAISEDeposited +=_amount;

            // if due to this stake tier has changed, and TierUpgradePool is active for this user
            // update user's TierUpgradePool `upgradeFrom` value to new tier and set `lastTierChange` timestamp as current. 
            if (prevTier != tier.tier && stu.status == StakeStatus.ACTIVE) {
                stu.upgradeFrom = tier.tier;
                stu.lastTierChange = block.timestamp;
            }
        }

        if(pending > 0) {
            paidOut += pending;
            pool.lpToken.safeTransfer(_msgSender(), pending);
        }

        emit Deposit(_msgSender(), _pid, depositAmount);
    }

    /**
        @dev Internal function to stake RAISE to 'Stake To Upgrade' pool.
        @param _amount Amount of tokens to stake to 'Stake To Upgrade' pool.
     */
    function _stakeRAISEForUpgrades(uint256 _amount) virtual internal {
        massUpdatePools();
        TierInfo storage user = tierInfo[_msgSender()];
        TierUpgradePool storage stu = upgradePool[_msgSender()];

        // check if amount staked in this pool is >= 500 RAISE tokens
        // otherwise there is no point in staking lesser amounts in this pool
        require(
            stu.amount + _amount >= 500 * ONE,
            "RF_SA: You should stake at least 500 RAISE to qualify for tier staking upgrade"
        );

        uint256 depositAmount = _amount;

        // Increase total RAISE deposited to this contract
        totalRAISEDeposited +=_amount;
        user.amount += _amount;
        stu.amount += _amount;

        Tier prevTier = stu.upgradeFrom;

        // set tier from which upgrades will be given
        user.tier = getCurrentTier(_msgSender());
        stu.upgradeFrom = user.tier;

        // if tier changed after this stake update lastTierChange
        if (prevTier != stu.upgradeFrom) {
            stu.lastTierChange = block.timestamp;
            // if this is the first stake to this pool change its status
            if (stu.status == StakeStatus.NA) {
                stu.status = StakeStatus.ACTIVE;
            }
        }

        RAISE.safeTransferFrom(_msgSender(), address(this), _amount);

        emit Deposit(_msgSender(), 999999, depositAmount);
    }

    /**
        @dev Internal function to return early unstaking fees back to the contract as staking rewards.
        @param _amount Amount of tokens to return back to contract as staking rewards.
     */
    function _returnFeeAsReward(uint256 _amount) virtual internal {
        require(endTimestamp != 0 && block.timestamp < endTimestamp, "RF_SA: too late, the farm is closed");
        endTimestamp += _amount / rewardPerSecond;
        totalRewards += _amount;
    }

    /**
        @dev Internal function to withdraw LP and RAISE tokens from contract.
        @param _pid Id of the pool from which to withdraw LP or RAISE tokens.
        @param _amount Amount of tokens to withdraw.
        @notice RAISE tokens withdrawing from RAISE pools earlier than their minimum staking period will be subject to early unstaking fee.
     */
    function _withdrawLP(uint256 _pid, uint256 _amount) virtual internal {
        massUpdatePools();
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_msgSender()];
        TierInfo storage tier = tierInfo[_msgSender()];

        require(tier.tokensUnlockTime <= block.timestamp, "RF_SA: Last sale you registered for is not finished yet.");
        require(user.amount >= _amount, "RF_SA: You can not withdraw more than you've deposited");

        uint256 pending;
        if (user.amount > 0) {
            pending = user.amount * pool.accERC20PerShare / precisionConstant - user.claimedReward;
        }

        pool.totalDeposits -= _amount;
        user.amount -= _amount;

        user.claimedReward = user.amount * pool.accERC20PerShare / precisionConstant;

        uint256 transferAmount = _amount;
        uint256 feeAmount;

        if (pool.lpToken == RAISE) {
            totalRAISEDeposited -= _amount;
            if (block.timestamp < pool.minStakingPeriod + user.lastRAISEStake) {
                feeAmount = _amount * earlyUnstakingFee / earlyUnstakingFeePrecision;
                transferAmount -= feeAmount;
                RAISEReturnedForStakingReward += feeAmount;
                _returnFeeAsReward(feeAmount);
            }

            tier.amount -= _amount;
            tier.tier = getCurrentTier(_msgSender());

            if (user.amount == 0) {
                user.lastRAISEStake = 0;
                user.firstRAISEStake = 0;
            }
        }

        if(pending > 0) {
            paidOut += pending;
            pool.lpToken.safeTransfer(_msgSender(), pending);
        }

        pool.lpToken.safeTransfer(address(_msgSender()), transferAmount);

        emit Withdraw(_msgSender(), _pid, transferAmount, feeAmount);
    }

    /**
        @dev Intenal function to withdraw RAISE tokens from 'Stake To Upgrade' pool.
        @notice User can withdraw only full amount of tokens staked in 'Stake To Upgrade' pool.
     */
    function _withdrawFromUpgrades() virtual internal {
        massUpdatePools();
        TierUpgradePool storage stu = upgradePool[_msgSender()];
        TierInfo storage tier = tierInfo[_msgSender()];
        
        require(stu.amount > 0, "RF_SA: There is nothing to withdraw");

        uint256 withdrawAmount = stu.amount;

        stu.amount = 0;
        tier.amount -= withdrawAmount;
        totalRAISEDeposited -= withdrawAmount;

        tier.tier = getCurrentTier(_msgSender());

        stu.lastTierChange = 0;
        stu.upgradeFrom = Tier.FAN;
        stu.status = StakeStatus.NA;

        RAISE.safeTransfer(address(_msgSender()), withdrawAmount);

        emit Withdraw(_msgSender(), 999999, withdrawAmount, 0);
    }
}