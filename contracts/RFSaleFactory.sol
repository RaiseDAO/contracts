// SPDX-License-Identifier: MIT
/**
    @title RFSaleFactory
    @author farruhsydykov
 */
pragma solidity ^0.8.0;

import "./RFProxy.sol";
import "./interfaces/IAdmin.sol";
import "./interfaces/IRFSaleFactory.sol";
import "./UpgradeableUtils/ContextUpgradeable.sol";
import "./UpgradeableUtils/Initializable.sol";

contract RFSaleFactory is IRFSaleFactory, Initializable {
    // Admin contract
    IAdmin public admin;
    // Allocation Staking contract
    address public allocationStaking;
    // Current sale contract implemetation
    address public saleContractImplementation;
    // Array of all created sales
    address[] private allSales;
    // Mapping of sale proxy addresses created by this factory
    mapping (address => bool) private saleCreatedThroughFactory;

    // * * * EVENTS * * * //

    event SaleDeployed(address saleContract);
    event SaleOwnerAndTokenSetInFactory(address sale, address saleOwner, address saleToken);

    modifier onlyAdmin {
        require(admin.isAdmin(msg.sender), "Only Admin can deploy sales");
        _;
    }

    /**
        @dev Initializes this contract.
        @param _adminContract Admin contract address.
        @param _allocationStaking Address of the allocationStaking contract.
        @param _saleContractImplementation Address of the sale contract that will be used as initial implementation.
     */
    function initialize(
        address _adminContract,
        address _allocationStaking,
        address _saleContractImplementation
    )
    public
    initializer{
        require(IAdmin(_adminContract).isAdmin(msg.sender), "Only Admin can initialize this contract");
        admin = IAdmin(_adminContract);
        allocationStaking = _allocationStaking;
        saleContractImplementation = _saleContractImplementation;
    }

    /**
        @dev Deploys a new sale proxy contract.
        @param _data The data to be passed to the new sale contract that after upgrade.
     */
    function deploySale(bytes memory _data) external onlyAdmin {
        RFProxy sale = new RFProxy(saleContractImplementation, _data, address(admin));

        saleCreatedThroughFactory[address(sale)] = true;
        allSales.push(address(sale));

        emit SaleDeployed(address(sale));
    }

    /**
        @dev Changes the implementation address.
        @param _newSaleContractImplementation New implementation address.
     */
    function changeSaleContractImplementation(address _newSaleContractImplementation) external onlyAdmin {
        require(_newSaleContractImplementation != address(0), "New implementation can not be address 0");
        saleContractImplementation = _newSaleContractImplementation;
    }

    /**
        @dev Set allocation staking contract address.
        @param _allocationStaking Address of the allocation staking contract.
     */
    function setAllocationStaking(address _allocationStaking) public onlyAdmin {
        require(_allocationStaking != address(0), "Allocation staking can not be address 0");
        allocationStaking = _allocationStaking;
    }

    /**
        @dev Function to return number of pools deployed.
        @return uint256 of sales deployed.
     */
    function getNumberOfSalesDeployed() external view returns(uint256) {
        return allSales.length;
    }

    /**
        @dev Function to return the address of the last sale.
        @return address of the last sale.
     */
    function getLastDeployedSale() external view returns(address) {
        if(allSales.length > 0) {
            return allSales[allSales.length - 1];
        }
        return address(0);
    }

    /**
        @dev Function to return the address of the sale with indexes starting and including `_startIndex` up untill `_endIndex` excluding it.
        @param _startIndex Starting index of returned sales.
        @param _endIndex Ending index of returned sales.
        @return memory Array of sales addresses.
     */
    function getSalesFromIndexToIndex(uint _startIndex, uint _endIndex) external view returns(address[] memory) {
        require(_endIndex > _startIndex, "Bad input");

        address[] memory sales = new address[](_endIndex - _startIndex);
        uint index = 0;

        for(uint i = _startIndex; i < _endIndex; i++) {
            sales[index] = allSales[i];
            index++;
        }

        return sales;
    }

    /**
        @dev Function that returns a boolean representing whether was created through this factory.
        @param _sale Address of the sale in question.
        @return bool Representing whether a sale was created through this factory.
     */
    function isSaleCreatedThroughFactory(address _sale) external view returns(bool) {
        return saleCreatedThroughFactory[_sale];
    }
}