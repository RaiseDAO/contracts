// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title Sale Factory of the Raise Finance project. See https://raisefinance.io for more details
/// @author asimaranov
/// @notice Sale factory implementations that allows to deploy sale instances for projects. Based on ERC1967Proxy because zkSync do not support EIP-1167
contract SaleFactory is Ownable {
    enum SaleType {
        erc20,
        erc1155
    }

    mapping(SaleType => address) public saleContractAddresses;
    mapping(SaleType => address[]) public sales;
    mapping(address => bool) public createdByFactory;  // Sale address => is created by factory

    event SaleCreated(address newSaleAddr, SaleType indexed saleType);

    constructor(address erc20SaleContractAddr_, address erc1155SaleContractAddr_) {
        saleContractAddresses[SaleType.erc20] = erc20SaleContractAddr_;
        saleContractAddresses[SaleType.erc1155] = erc1155SaleContractAddr_;
    }

    /// @notice Creates a new sale contract instance
    /// @param saleOwner Owner of the sale, member of project to integrate
    /// @param saleType Sale type. ERC20 / ERC1155
    /// @param payTokenAddr Address of pay token
    /// @param projectTokenAddr Address of project token
    /// @param projectTokenDecimals Decimals of project token
    /// @param minimumAmountToFund Minimum amount of tokens sale owner should deposit
    function createSale(
        address saleOwner, 
        SaleType saleType, 
        address payTokenAddr, 
        address projectTokenAddr, 
        uint256 projectTokenDecimals, 
        uint256 minimumAmountToFund,
        bool isWithdrawVestingEnabled, 
        uint8 serviceFeePercent
    ) 
        public onlyOwner 
    {
        
        address newSale = address(new ERC1967Proxy(saleContractAddresses[saleType], 
        abi.encodeWithSignature(
            "initialize(address,address,address,address,uint256,uint256,bool,uint8)", 
            msg.sender, saleOwner, payTokenAddr, projectTokenAddr, 10**projectTokenDecimals, minimumAmountToFund, isWithdrawVestingEnabled, serviceFeePercent
            )
        ));

        createdByFactory[newSale] = true;
        sales[saleType].push(newSale);
        
        emit SaleCreated(newSale, saleType);
    }

    /// @notice Updates sale contract implemetation
    function updateSaleContract(SaleType saleType, address newSaleContractAddr) public onlyOwner {
        saleContractAddresses[saleType] = newSaleContractAddr;
    }

    /// @notice Returns total sales num
    function getTotalSalesNum() public view returns (uint256) {
        return sales[SaleType.erc20].length + sales[SaleType.erc1155].length;
    }

    /// @notice Returns sales of specific type num
    function getSalesNum(SaleType saleType) public view returns (uint256) {
        return sales[saleType].length;
    }

    /// @notice Returns sales created by factory. Supports pagination
    /// @param saleType Sale type to query
    /// @param offset Start index
    /// @param maxCount Maximum amount to query
    function getSales(SaleType saleType, uint256 offset, uint256 maxCount) public view returns (address[] memory) {
        uint256 salesLength = sales[saleType].length;

        require(offset <= salesLength, "Offset is greater than sales num");

        uint256 amountToQuery = maxCount;

        if (offset + maxCount > salesLength)
            amountToQuery = salesLength - offset;
        
        address[] memory result = new address[](amountToQuery);

        for(uint256 i = 0; i < amountToQuery; i++)
            result[i] = sales[saleType][offset + i];

        return result;
    }

    /// @notice Returns is sale created by the factory
    /// @param saleAddress_ Address of the sale to check
    function isCreatedByFactory(address saleAddress_) public view returns (bool) {
        return createdByFactory[saleAddress_];
    }
}