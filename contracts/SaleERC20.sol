// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import "./Tier.sol";

/// @title ERC20 token sale of the Raise Finance project. See https://raisefinance.io for more details
/// @author asimaranov
/// @notice Implements token sale with rounds and tier-based priority management
contract SaleERC20 is Pausable, Initializable {
    using SafeERC20 for IERC20;

    struct Round {
        uint256 id;
        bool wasStopped;
        bool isFinal;
        Tier requiredTier;
        bytes32 usersInfoRoot;
        uint256 maxAllocation;
        uint256 boughtProjectToken;
        uint256 maxAllocationPerUser;
        uint256 deadline; 
        uint256 tokenPrice;
    }

    bool public isSaleStarted;
    bool public isWithdrawVestingEnabled;
    bool public isUnhealthy;
    address public raiseAdmin;
    address public saleOwner;
    IERC20 public payToken;
    IERC20 public projectToken;
    Round[] public rounds;
    mapping(address => uint256) public boughtProjectTokenByUser; // User => amount
    mapping(address => uint256) public claimedProjectTokenByUser; // User => amount
    mapping(address => uint256) public donatedPayTokenByUser; // User => amount
    uint256 public minimumAmountToFund;
    uint256 public totalProjectTokenSold;
    uint256 public totalPayTokenCollected;
    uint256 public totalPayTokenWithdrawn;
    uint256 public projectTokenBalance;
    uint256 public oneProjectToken;
    uint256[] public claimTimes;
    uint8[] public claimPercents;
    uint256[] public saleOwnerWithdrawTimes;
    uint8[] public saleOwnerWithdrawPercents;
    uint256 public sumToRefundIfUnhealthy;
    uint8 public serviceFeePercent;

    event RoundStarted(uint256 indexed id, Tier indexed requiredTier, uint256 deadline);
    event Bought(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event SaleOwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RaiseAdminRoleTransferred(address indexed previousAdmin, address indexed newAdmin);
    event Funded(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event EmergencyWithdrawn(address indexed user, uint256 amount);
    event RaisedFundsWithdrawn(uint256 amount, uint256 actualAmount, uint256 fee);
    event RaisedFundsWithdrawnEmergency(uint256 amount);
    event Refunded(address indexed user, uint256 amount);
    event HealthStatusSet(bool isUnhealthy);

    modifier onlyRaiseAdmin() {
        require(msg.sender == raiseAdmin, "Caller is not the raise admin");
        _;
    }

    modifier onlySaleOwner() {
        require(msg.sender == saleOwner, "Caller is not the owner");
        _;
    }

    modifier ifWithdrawVestingEnabled() {
        require(isWithdrawVestingEnabled, "Withdraw vesting is not enabled");
        _;
    }

    modifier onlyHealthy() {
        require(!isUnhealthy, "Project is unhealthy");
        _;
    }

    modifier ifProjectUnhealthy() {
        require(isUnhealthy, "Project is healthy");
        _;
    }

    function initialize(
        address raiseAdmin_, 
        address saleOwner_, 
        address payTokenAddr, 
        address projectTokenAddr,
        uint256 oneProjectToken_,
        uint256 minimumAmountToFund_,
        bool isWithdrawVestingEnabled_, 
        uint8 serviceFeePercent_
    )
        public initializer  
    {
        payToken = IERC20(payTokenAddr);
        projectToken = IERC20(projectTokenAddr);
        claimPercents = [100];
        claimTimes = [block.timestamp];
        saleOwnerWithdrawPercents = [100];
        saleOwnerWithdrawTimes = [block.timestamp];
        raiseAdmin = raiseAdmin_;
        saleOwner = saleOwner_;
        isWithdrawVestingEnabled = isWithdrawVestingEnabled_;
        minimumAmountToFund = minimumAmountToFund_;
        serviceFeePercent = serviceFeePercent_;
        oneProjectToken = oneProjectToken_;
    }

    /// @notice Transfers raise admin role
    function transferRaiseAdminRole(address newRaiseAdmin) public onlyRaiseAdmin {
        require(newRaiseAdmin != address(0), "New admin is null address");
        raiseAdmin = newRaiseAdmin;
        emit RaiseAdminRoleTransferred(raiseAdmin, newRaiseAdmin);
    }

    /// @notice Transfers sale owner role
    function transferSaleOwnership(address newOwner) public onlySaleOwner {
        require(newOwner != address(0), "New owner is null address");
        saleOwner = newOwner;
        emit SaleOwnershipTransferred(saleOwner, newOwner);
    }

    /// @notice Funds the service with project token
    /// @param amount Amount to fund
    function fund(uint256 amount) public {
        projectTokenBalance += amount;
        projectToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Funded(msg.sender, amount);
    }

    /// @notice Sale owner can withdraw project token left after sale ended
    function withdraw() public onlySaleOwner {
        require(isSaleFinished(), "Not available before sale end");
        require(projectTokenBalance > totalProjectTokenSold, "Nothing to withdraw");
        uint256 amount =  projectTokenBalance - totalProjectTokenSold;

        projectTokenBalance -= amount;
        projectToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Withdraws project token if there is something wrong with the project
    function emergencyWithdraw() public onlyRaiseAdmin ifProjectUnhealthy {
        uint256 amount = projectTokenBalance;

        projectTokenBalance = 0;
        projectToken.safeTransfer(msg.sender, amount);

        emit EmergencyWithdrawn(msg.sender, amount);
    }

    /// @notice Starts new sale round
    /// @param requiredTier Tier required to participate in the round
    /// @param maxAllocation Maxmum amount of project tokens can be bought in the round
    /// @param maxAllocationPerUser Maxmum amount of project tokens can be bought be one user in the round
    /// @param periodSeconds Round duration in seconds
    /// @param tokenPrice_ Price of the project token
    /// @param isFinal Is sale ends after this round
    /// @param usersInfoRoot Whitelist merkle tree root
    function createRound (
        Tier requiredTier,
        uint256 maxAllocation,  // In project tokens
        uint256 maxAllocationPerUser, // In project tokens
        uint256 periodSeconds,
        uint256 tokenPrice_,
        bool isFinal,
        bytes32 usersInfoRoot
    )
        public onlyRaiseAdmin
    {
        if (!isSaleStarted) {
            isSaleStarted = true;
            require(projectTokenBalance >= minimumAmountToFund, "Sale is not funded");
        }

        uint256 roundsLength = rounds.length;
        uint256 deadline = block.timestamp + periodSeconds;

        require(roundsLength == 0 || rounds[roundsLength-1].wasStopped || rounds[roundsLength-1].deadline < block.timestamp, "First stop ongoing round");
        require(tokenPrice_ > 0, "Token price can't be zero");

        rounds.push(Round({
            id: roundsLength,
            wasStopped: false,
            isFinal: isFinal,
            requiredTier: requiredTier,
            maxAllocation: maxAllocation,
            maxAllocationPerUser: maxAllocationPerUser,
            boughtProjectToken: 0,
            deadline: deadline,
            tokenPrice: tokenPrice_,
            usersInfoRoot: usersInfoRoot
        }));

        emit RoundStarted(roundsLength, requiredTier, deadline);
    }

    /// @notice Stops the current round early
    /// @param roundId Round to stop id
    function stopRound(uint256 roundId) public onlyRaiseAdmin {
        rounds[roundId].wasStopped = true;
    }

    /// @notice Buy project token for given amount of payTokenAmount
    /// @param payTokenAmount Amount of pay token to pay
    /// @param allocationBonusPercent Whitelisted user allocation bonus percent
    /// @param proof Proof that user can participate and has the corresponding allocation bonus
    function buy(uint256 payTokenAmount, uint8 allocationBonusPercent, bytes32[] memory proof) public whenNotPaused onlyHealthy {
        Round memory ongoingRound = getOngoingRound();

        uint256 projectTokenAmount = payTokenAmount * oneProjectToken / ongoingRound.tokenPrice;

        require(projectTokenAmount > 0, "Nothing to buy");

        uint256 maxAllocationPerUser = ongoingRound.maxAllocationPerUser;

        require(MerkleProof.verify(proof, ongoingRound.usersInfoRoot, keccak256(abi.encodePacked(msg.sender, allocationBonusPercent))), "User can't participate");

        uint256 userMaxAllocation = maxAllocationPerUser + maxAllocationPerUser * allocationBonusPercent / 100;
        uint256 alreadyBought = boughtProjectTokenByUser[msg.sender];

        require(projectTokenAmount <= userMaxAllocation - alreadyBought, "Allocation per user exceeded");
        require(projectTokenAmount <= ongoingRound.maxAllocation - ongoingRound.boughtProjectToken, "Round allocation exceeded");

        boughtProjectTokenByUser[msg.sender] += projectTokenAmount; 
        totalProjectTokenSold += projectTokenAmount;
        rounds[ongoingRound.id].boughtProjectToken += projectTokenAmount;

        uint256 initialPayTokenBalance = payToken.balanceOf(address(this));

        payToken.safeTransferFrom(msg.sender, address(this), payTokenAmount);

        uint256 finalPayTokenBalance = payToken.balanceOf(address(this));
        uint256 payTokenReceived = finalPayTokenBalance - initialPayTokenBalance;

        totalPayTokenCollected += payTokenReceived;
        donatedPayTokenByUser[msg.sender] += payTokenReceived;

        emit Bought(msg.sender, projectTokenAmount);
    }

    /// @notice Claims available part of project tokens according to vesting
    function claim() public whenNotPaused {
        uint256 boughtProjectToken = boughtProjectTokenByUser[msg.sender];
        uint256 withdrawnProjectToken = claimedProjectTokenByUser[msg.sender];

        require(boughtProjectToken > withdrawnProjectToken, "All the bought tokens claimed");

        uint256 percentsWithdrawn = withdrawnProjectToken * 100 / boughtProjectToken;
        uint8 accPercentsToGive = 0;

        for (uint256 i = 0; i < claimTimes.length; i++) {
            if (claimTimes[i] <= block.timestamp)
                accPercentsToGive += claimPercents[i];
        } 

        require(accPercentsToGive > percentsWithdrawn, "Nothing to claim now");

        uint256 sumToGive = (accPercentsToGive - percentsWithdrawn) * boughtProjectToken / 100;

        require(sumToGive <= projectTokenBalance, "Not enough service balance");

        projectTokenBalance -= sumToGive;
        claimedProjectTokenByUser[msg.sender] += sumToGive;
        projectToken.safeTransfer(msg.sender, sumToGive);

        emit Claimed(msg.sender, sumToGive);
    }

    /// @notice Withdraws part of raised funds to the sale owner according to the vesting
    function withdrawRaisedFunds() public onlySaleOwner onlyHealthy {
        uint256 tokenCollected = totalPayTokenCollected;
        uint256 tokenWithdrawn = totalPayTokenWithdrawn;
        uint256 amountToWithdraw = tokenCollected - tokenWithdrawn;

        require(amountToWithdraw > 0, "Nothing to withdraw");

        uint256 amountToWithdrawNow = amountToWithdraw;

        if (isWithdrawVestingEnabled) {
            uint256 percentsWithdrawn = tokenWithdrawn * 100 / tokenCollected;
            uint8 accPercentsToGive = 0;

            for (uint256 i = 0; i < saleOwnerWithdrawTimes.length; i++) {
                if (saleOwnerWithdrawTimes[i] <= block.timestamp) {
                    accPercentsToGive += saleOwnerWithdrawPercents[i];
                }
            } 

            require(accPercentsToGive > percentsWithdrawn, "Nothing to withdraw now");

            amountToWithdrawNow = (accPercentsToGive - percentsWithdrawn) * tokenCollected / 100;
        } 

        totalPayTokenWithdrawn += amountToWithdrawNow;

        uint256 fee = amountToWithdrawNow * serviceFeePercent / 100;

        payToken.safeTransfer(msg.sender, amountToWithdrawNow - fee);
        payToken.safeTransfer(raiseAdmin, fee);

        emit RaisedFundsWithdrawn(amountToWithdrawNow, amountToWithdrawNow - fee, fee);
    }

    /// @notice Raise admin can withdraw raised funds if there is something wrong with the project
    function emergencyWithdrawRaisedFunds() public onlyRaiseAdmin ifProjectUnhealthy {        
        uint256 amountToWithdraw = totalPayTokenCollected - totalPayTokenWithdrawn;

        require(amountToWithdraw > 0, "Nothing to withdraw");

        totalPayTokenWithdrawn += amountToWithdraw;
        payToken.safeTransfer(msg.sender, amountToWithdraw);

        emit RaisedFundsWithdrawnEmergency(amountToWithdraw);
    }

    /// @notice User can refund pay tokens left if there is something wrong with the project
    function refund() public ifProjectUnhealthy {
        uint256 amountToRefund = sumToRefundIfUnhealthy * donatedPayTokenByUser[msg.sender] / totalPayTokenCollected;

        require(amountToRefund > 0, "Nothing to refund");
        
        totalPayTokenWithdrawn += amountToRefund;
        donatedPayTokenByUser[msg.sender] = 0;
        payToken.safeTransfer(msg.sender, amountToRefund);

        emit Refunded(msg.sender, amountToRefund);
    }

    /// @notice Sets vesting schedule for project token claiming
    /// @param claimTimes_ Timestamps when parts can be withdrawed
    /// @param claimPercents_ Percents of the parts. The sum should be 100
    function setVestingSchedule(uint256[] calldata claimTimes_, uint8[] calldata claimPercents_) public onlyRaiseAdmin {
        require(claimTimes_.length == claimPercents_.length, "Array sizes must be the same");
        require(claimTimes_.length != 0, "Schedule can not be empty");

        uint256 totalPercent = 0;

        for (uint256 i = 0; i < claimTimes_.length; i++) 
            totalPercent += claimPercents_[i];

        require(totalPercent == 100, "Claim percents sum is not 100");

        claimTimes = claimTimes_;
        claimPercents = claimPercents_;
    }

    /// @notice Sets vesting schedule for pay token claiming by sale owner
    /// @param withdrawTimes Timestamps when parts can be withdrawed
    /// @param withdrawPercents Percents of the parts. The sum should be 100
    function setWithdrawScheduleForSaleOwner(uint256[] calldata withdrawTimes, uint8[] calldata withdrawPercents) public onlyRaiseAdmin ifWithdrawVestingEnabled {
        require(withdrawTimes.length == withdrawPercents.length, "Array sizes must be the same");
        require(withdrawTimes.length != 0, "Schedule can not be empty");

        uint256 totalPercent = 0;

        for (uint256 i = 0; i < withdrawTimes.length; i++) 
            totalPercent += withdrawPercents[i];

        require(totalPercent == 100, "Withdraw percents sum is not 100");

        saleOwnerWithdrawTimes = withdrawTimes;
        saleOwnerWithdrawPercents = withdrawPercents;
    }

    /// @notice Shifts vesting schedule for project token claiming
    /// @param secondsToShift Time to shift in seconds
    function shiftVestingSchedule(uint256 secondsToShift) public onlyRaiseAdmin {
        for (uint256 i = 0; i < claimTimes.length; i++) 
            claimTimes[i] += secondsToShift;
    }

    /// @notice Shifts vesting schedule for pay token claiming by sale owner
    /// @param secondsToShift Time to shift in seconds
    function shiftSaleOwnerWithdrawSchedule(uint256 secondsToShift) public onlyRaiseAdmin ifWithdrawVestingEnabled {
        for (uint256 i = 0; i < saleOwnerWithdrawTimes.length; i++) 
            saleOwnerWithdrawTimes[i] += secondsToShift;
    }

    /// @notice Marks if there is something wrong with the project
    /// @param isUnhealthy_ Unhealthy status
    function setIsUnhealthy(bool isUnhealthy_) public onlyRaiseAdmin {
        isUnhealthy = isUnhealthy_;

        if (isUnhealthy)
            sumToRefundIfUnhealthy = totalPayTokenCollected - totalPayTokenWithdrawn;

        emit HealthStatusSet(isUnhealthy_);
    }

    /// @notice Updates sale fee
    /// @param newFeePercent New service fee percent
    function setServiceFee(uint8 newFeePercent) public onlyRaiseAdmin {
        serviceFeePercent = newFeePercent;
    }

    /// @notice Pauses the contract
    function pause() public onlyRaiseAdmin {
        _pause();
    }

    /// @notice Unpauses the contract
    function unpause() public onlyRaiseAdmin {
        _unpause();
    }

    /// @notice Returns full ongoing round info
    function getOngoingRound() public view returns (Round memory) {
        require(rounds.length > 0, "No rounds created");

        Round memory round = rounds[rounds.length - 1];

        require(round.deadline >= block.timestamp, "Round ended");
        require(!round.wasStopped, "No active rounds");

        return round;
    }

    /// @notice Returns ongoing round info for frontend
    function getOngoingRoundInfo() 
        public view 
        returns (
            uint256 id, 
            uint256 deadline, 
            Tier requiredTier,
            uint256 tokenPrice, 
            uint256 maxAllocation, 
            uint256 maxAllocationPerUser
        ) 
    {
        Round memory ongoingRound = getOngoingRound();
        id = ongoingRound.id;
        deadline = ongoingRound.deadline;
        tokenPrice = ongoingRound.tokenPrice;
        requiredTier = ongoingRound.requiredTier;
        maxAllocation = ongoingRound.maxAllocation;
        maxAllocationPerUser = ongoingRound.maxAllocationPerUser;
    }

    /// @notice Is user can participate
    function canParticipate(address user, uint8 allocationBonusPercent, bytes32[] memory proof) public view returns (bool) {
        Round memory round = getOngoingRound();
        return MerkleProof.verify(proof, round.usersInfoRoot, keccak256(abi.encodePacked(user, allocationBonusPercent)));
    }

    /// @notice Returns project token vesting schedule and amounts to claim
    function getClaimInfo(address user)
        public view 
        returns (
            uint256 amountToClaim, 
            uint256[] memory claimTimes_, 
            uint8[] memory claimPercents_
        ) 
    {
        uint256 boughtProjectToken = boughtProjectTokenByUser[user];
        uint256 withdrawnProjectToken = claimedProjectTokenByUser[user];

        if (boughtProjectToken > withdrawnProjectToken) {

            uint256 percentsWithdrawn = withdrawnProjectToken * 100 / boughtProjectToken;
            uint8 accPercentsToGive = 0;
            uint256 claimTimesLength = claimTimes.length;

            for (uint256 i = 0; i < claimTimesLength; i++) {
                if (claimTimes[i] <= block.timestamp)
                    accPercentsToGive += claimPercents[i];
            }

            if (accPercentsToGive > percentsWithdrawn)
                amountToClaim = (accPercentsToGive - percentsWithdrawn) * boughtProjectToken / 100;
        }

        claimTimes_ = claimTimes;
        claimPercents_ = claimPercents;
    }

    /// @notice Returns total pay token paid by users
    function totalRaised() public view returns (uint256) {
        return totalPayTokenCollected;
    }

    /// @notice Returns is final sale ended or was stopped
    function isSaleFinished() public view returns (bool) {
        uint256 roundsLength = rounds.length;
        
        if (roundsLength == 0) return false;

        Round storage lastRound = rounds[roundsLength - 1];

        return lastRound.isFinal && (block.timestamp > lastRound.deadline || lastRound.wasStopped);
    }
}