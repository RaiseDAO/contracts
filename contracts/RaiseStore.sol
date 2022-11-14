//SPDX-License-Identifier: MIT
//@author asimaranov

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RaiseStore is ERC1155, Ownable {
    using SafeERC20 for IERC20;

    struct UserOrder {
        uint128 shopUUID;
        address sellerAddr;
        uint256 userId;
        OrderItem[] items;
    }

    struct OrderItem {
        uint128 itemUUID;
        uint32 amount;
        address payToken;
        uint256 itemPrice;
        bytes32 additionalInfo;
    }

    struct ShopItem {
        uint128 shopUUID;
        uint128 itemUUID;
        address sellerAddr;
        address payToken;
        bool isAvaiable;
        uint256 itemPrice;
        bytes32 additionalInfo;
    }

    event UserBought(address sellerAddr, UserOrder order);
    event TokenWhitelisted(address token);
    event TokenBlacklisted(address token);
    event ItemRegistered(uint128 itemUUID, ShopItem item);
    event ItemEdited(uint128 itemUUID, ShopItem item);
    event ItemDeleted(uint128 itemUUID);

    uint256 public serviceFeePromille;
    mapping(address => bool) public whitelistedTokens;
    mapping(uint128 => ShopItem) public registeredItems;

    constructor(uint256 serviceFeePromille_) ERC1155("https://api.raisepay.io/item/{id}.json") {
        serviceFeePromille = serviceFeePromille_;
    }

    function changeNftUrl(string calldata uri_) public onlyOwner {
        _setURI(uri_);
    }

    function whitelistTokens(address[] calldata tokens) public onlyOwner {
        for(uint256 i = 0; i < tokens.length; i++) {
            whitelistedTokens[tokens[i]] = true;
            emit TokenWhitelisted(tokens[i]);
        }
    }

    function blacklistTokens(address[] calldata tokens) public onlyOwner {
        for(uint256 i = 0; i < tokens.length; i++) {
            whitelistedTokens[tokens[i]] = false;
            emit TokenBlacklisted(tokens[i]);
        }
    }

    function registerItems(ShopItem[] calldata items) public {
        for(uint256 i = 0; i < items.length; i++) {
            ShopItem memory item = items[i];

            require(item.itemUUID != 0, "Item id can't be zero");
            require(registeredItems[item.itemUUID].itemUUID == 0, "Item already registered");
            require(whitelistedTokens[item.payToken], "Token is not whitelisted");

            registeredItems[item.itemUUID] = item;
            emit ItemRegistered(item.itemUUID, item);
        }
    }

    function editRegisteredItems(ShopItem[] calldata items) public {
        for(uint256 i = 0; i < items.length; i++) {
            ShopItem memory item = items[i];

            require(item.itemUUID != 0, "Item id can't be zero");
            require(msg.sender == registeredItems[item.itemUUID].sellerAddr, "Only owner can edit item");
            require(registeredItems[item.itemUUID].itemUUID != 0, "Item not found");
            require(whitelistedTokens[item.payToken], "Token is not whitelisted");

            registeredItems[item.itemUUID] = item;
            emit ItemEdited(item.itemUUID, item);
        }
    }

    function deleteRegisteredItems(uint128[] calldata itemsToDelete) public {
        for(uint256 i = 0; i < itemsToDelete.length; i++) {
            require(msg.sender == registeredItems[itemsToDelete[i]].sellerAddr, "Only owner can edit item");

            delete registeredItems[itemsToDelete[i]];

            emit ItemDeleted(itemsToDelete[i]);
        }
    }

    function buy(UserOrder calldata order, bool allowUnregisteredItems) public {
        for(uint256 i = 0; i < order.items.length; i++) {
            OrderItem memory item = order.items[i];

            require(whitelistedTokens[item.payToken], "Token is not whitelisted");

            // Check either unregistered items are allowed or item is registered
            require(allowUnregisteredItems || registeredItems[item.itemUUID].itemUUID != 0, "Only registered items allowed");

            // Item is registered
            if (registeredItems[item.itemUUID].itemUUID != 0) {
                ShopItem memory registeredItem = registeredItems[item.itemUUID];

                require(registeredItem.payToken == item.payToken, "Invalid paytoken");
                require(registeredItem.itemPrice == item.itemPrice, "Invalid price");
                require(registeredItem.sellerAddr == order.sellerAddr, "Invalid seller address");
                require(registeredItem.isAvaiable, "Item is not available");
            }

            _mint(msg.sender, item.itemUUID, item.amount, "");
            uint256 sum = item.amount * item.itemPrice;
            uint256 fee = sum * serviceFeePromille / 1000;

            IERC20(item.payToken).safeTransferFrom(msg.sender, order.sellerAddr, sum - fee);
            IERC20(item.payToken).safeTransferFrom(msg.sender, address(this), fee );
        }
        
        emit UserBought(order.sellerAddr, order);
    }

    function withdraw(address tokenAddr, uint256 amount) public onlyOwner {
        IERC20(tokenAddr).safeTransfer(msg.sender, amount);
    }

    function checkSignature(
        address userAddress, 
        uint128 itemUUID, 
        uint8 v, 
        bytes32 r, 
        bytes32 s, 
        uint256 timestamp, 
        uint256 maxTimeDelta
    ) 
        public view returns (bool)
    {
        
        ShopItem memory registeredItem = registeredItems[itemUUID];

        require(registeredItem.itemUUID != 0, "Item not found");

        uint256 balance = balanceOf(userAddress, itemUUID);
        
        require(balance > 0, "User haven't got nft");

        bytes memory prefix = "\x19Ethereum Signed Message:\n49";
        bytes32 prefixedProof = keccak256(abi.encodePacked(prefix, "RaiseStore", timestamp));

        address signer = ecrecover(prefixedProof, v, r, s);
        require(signer == userAddress, "Invalid signer");

        if (timestamp < block.timestamp)
            timestamp = block.timestamp;
        
        require(block.timestamp - timestamp < maxTimeDelta, "Expired");

        return true;
    }
}
