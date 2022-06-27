// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRFSaleFactory {
    function initialize(address _adminContract, address _allocationStaking, address _saleContractImplementation)external;
    function deploySale(bytes memory _data) external;
    function changeSaleContractImplementation(address _newSaleContractImplementation) external;
    function setAllocationStaking(address _allocationStaking) external;
    function getNumberOfSalesDeployed() external view returns(uint256);
    function getLastDeployedSale() external view returns(address);
    function getSalesFromIndexToIndex(uint _startIndex, uint _endIndex) external view returns(address[] memory);
    function isSaleCreatedThroughFactory(address _sender) external returns (bool);
}