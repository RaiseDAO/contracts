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
        address sellerAddr;
        uint256 userTgId;
        OrderItem[] items;
    }

    struct OrderItem {
        uint128 itemUUID;
        uint32 amount;
        address payToken;
        uint256 itemPrice;
    }

    event UserBought(address sellerAddr, UserOrder order);

    uint256 public serviceFeePromille;
    mapping(address => bool) public whitelistedTokens;

    constructor(uint256 serviceFeePromille_) ERC1155("https://api.raisepay.dev/item/{id}.json") {
        serviceFeePromille = serviceFeePromille_;
    }

    function whitelistTokens(address[] calldata tokens) public {
        for(uint i = 0; i < tokens.length; i++) {
            whitelistedTokens[tokens[i]] = true;
        }
    }

    function blacklistTokens(address[] calldata tokens) public {
        for(uint i = 0; i < tokens.length; i++) {
            whitelistedTokens[tokens[i]] = false;
        }
    }

    function buy(UserOrder calldata order) public {
        for(uint256 i = 0; i < order.items.length; i++) {
            OrderItem memory item = order.items[i];

            require(whitelistedTokens[item.payToken], "Token is not whitelisted");

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
}