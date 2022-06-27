// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Enums.sol";

interface IRFSale is Enums {
    function setSaleParams(address _saleToken, address _paymentToken, address _saleOwner, uint256 _tokenPriceInPaymentToken) external;
    function setSaleToken(address _saleToken) external;
    function fundSale(uint256 _amountFunded) external;
    function setRegistrationTime(uint256 _registrationTimeStarts, uint256 _registrationTimeEnds) external;
    function setVestingParams(uint256[] memory _vestingPortionsUnlockTime, uint256[] memory _vestingPercentPerPortion, bool _initialSetup) external;
    function setTierRoundInfo(uint256[] calldata _portionsOfTotalAmountOfTokensPerRound, uint256[] calldata _minBuyAmountInPaymentToken, uint256[] calldata _maxBuyAmountInPaymentToken) external;
    function registerForSale(uint256 _paymentTokenAmountToPay) external;
    function getRegisteredMerchantsAddresses(uint256 _startIndex, uint256 _endIndex) external returns (address[] memory _addresses);
    function getRegisteredDealersAddresses(uint256 _startIndex, uint256 _endIndex) external returns (address[] memory _addresses);
    function claimTokens(bytes32[] calldata _merkleProof, bytes32 _hash, bytes memory _signature) external;
    function getUserPortionsInfo(address _user) external view returns(bool[] memory arePortionsWithdrawn_);
    function startFanRound(uint256 _minBuyAmountInPaymentToken, uint256 _maxBuyAmountInPaymentToken) external;
    function withdrawLeftoverSaleTokens() external;
    function withdrawPaymentTokensRaised() external;
    function getUsersRegistryInfo(address _user) external view returns(uint256 roundId_, uint256 ticketsAmount_, uint256 paymentTokenPaid_);
    function isWhitelistRootHashSet() external view returns(bool);
    function setWhitelistRootHashes(uint256 _amountOfTokensPurchasedByMerchants, uint256 _amountOfTokensPurchasedByDealers, bytes32 _whitelistRootHashForMerchant, bytes32 _whitelistRootHashForDealer) external;
    function checkWhitelist(address _user, bytes32[] calldata _merkleProof, uint256 _roundId) external view returns(bool _userInWhitelist);
    function updateTokenPriceInPaymentToken(uint256 _newPrice) external;
    function extendRegistrationPeriod(uint256 _timeToAdd, bool _postpone) external;
    function getRoundInfo(uint256 _roundId) external view returns(uint256 _tokensAvailable, uint256 _tokensPurchased, uint256 _minBuyAmountInPaymentTokens, uint256 _maxBuyAmountInPaymentTokens);
    function getVestingInfo() external view returns(uint256[] memory, uint256[] memory);
    function changeBackendAddress(address _backendAddress) external;
}