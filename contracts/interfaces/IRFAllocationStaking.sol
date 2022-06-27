// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Enums.sol";
import "../Utils/TestToken/IERC20.sol";

interface IRFAllocationStaking is Enums {
    function initialize(address _erc20, uint256 _rewardPerSecond, uint256 _startTimestamp, uint256 _earlyUnstakingFee, address _salesFactory, uint256 _tokensPerTicket, address _admin) external;
    function pause() external;
    function unpause() external;
    function setRewardPerSecond(uint256 _newRewardPerSecond) external;
    function setEarlyUnstakingFee(uint256 _newEarlyUnstakingFee) external;
    function setSalesFactory(address _salesFactory) external;
    function add(uint256 _allocPoint, address _lpToken, uint256 _minStakingPeriod, bool _withUpdate) external;
    function set(uint256 _pid, uint256 _allocPoint, uint256 _minStakingPeriod, bool _withUpdate) external;
    function poolLength() external view returns (uint256);
    function getPendingAndDepositedForUsers(address[] memory _users, uint _pid) external view returns (uint256 [] memory , uint256 [] memory);
    function totalPending() external view returns (uint256);
    function setTokensUnlockTime(address _user, uint256 _tokensUnlockTime) external;
    function fund(uint256 _amount) external;
    function massUpdatePools() external;
    function setTokensPerTicket(uint256 _amount) external;
    function updatePool(uint256 _pid) external;
    function deposited(uint256 _pid, address _user) external view returns(uint256);
    function pendingReward(uint256 _pid, address _user) external view returns(uint256);
    function deposit(uint256 _pid, uint256 _amount) external;
    function withdraw(uint256 _pid, uint256 _amount) external;
    function withdrawPending(uint256 _pid) external;
    function getTicketAmount(address _user) external view returns(uint256 ticketAmount_);
    function getCurrentTier(address _user) external view returns(Tier tier);
    function fanStakedForTwoWeeks(address _user) external view returns(bool isStakingRAISEForTwoWeeks_);
}