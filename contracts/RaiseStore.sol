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
    }

    event UserBought(address sellerAddr, UserOrder order);

    uint256 public serviceFeePromille;
    mapping(address => bool) public whitelistedTokens;

    constructor(uint256 serviceFeePromille_) ERC1155("https://api.raisepay.io/item/{id}.json") {
        serviceFeePromille = serviceFeePromille_;
    }

    function whitelistTokens(address[] calldata tokens) public onlyOwner {
        for(uint i = 0; i < tokens.length; i++) {
            whitelistedTokens[tokens[i]] = true;
        }
    }

    function blacklistTokens(address[] calldata tokens) public onlyOwner {
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

contract RevealableErc1155 is ERC1155, Ownable {
    using SafeERC20 for IERC20;

    event NftCreated(address user, uint256 nftId);

    uint256 public serviceFeePromille;
    mapping(address => bool) public whitelistedTokens;
    NftInfo[] public nfts;
    
    struct NftInfo {
        bytes16 imageHash;
        address token;
        uint256 price;
        address sellerAddr;
    }
    constructor(uint256 serviceFeePromille_) ERC1155("https://api.raisepay.io/nft/{id}.json") {
        serviceFeePromille = serviceFeePromille_;
    }

    function changeNftUrl(string calldata uri_) public onlyOwner {
        _setURI(uri_);
    }

    function createNft(bytes16 imageHash, address tokenAddr, uint256 price) public returns (uint256 nftId) {
        nftId = nfts.length;
        emit NftCreated(msg.sender, nftId);
        nfts.push(NftInfo(imageHash, tokenAddr, price, msg.sender)); 
    }

    function buyNft(uint256 id) public {
        require(id < nfts.length, "No nft with such id");
        NftInfo memory nft = nfts[id];
        
        uint256 fee = nft.price * serviceFeePromille / 1000;

        IERC20(nft.token).safeTransferFrom(msg.sender, nft.sellerAddr, nft.price - fee);
        IERC20(nft.token).safeTransferFrom(msg.sender, address(this), fee);

        _mint(msg.sender, id, 1, "");
    }

    function withdraw(address tokenAddr, uint256 amount) public onlyOwner {
        IERC20(tokenAddr).safeTransfer(msg.sender, amount);
    }

    function checkSignature(
        address userAddress, 
        uint256 nftId, 
        uint8 v, 
        bytes32 r, 
        bytes32 s, 
        uint256 timestamp, 
        uint256 maxTimeDelta
    ) 
        public view returns (bool) 
    {
        require(nftId < nfts.length, "No nft with such id");

        uint256 balance = balanceOf(userAddress, nftId);
        
        require(balance > 0, "User haven't got nft");

        bytes memory prefix = "\x19Ethereum Signed Message:\n49";
        bytes32 prefixedProof = keccak256(abi.encodePacked(prefix, "RevealableErc1155", timestamp));

        address signer = ecrecover(prefixedProof, v, r, s);
        require(signer == userAddress, "Invalid signer");

        if (timestamp < block.timestamp)
            timestamp = block.timestamp;
        
        require(block.timestamp - timestamp < maxTimeDelta, "Expired");

        return true;
    }
}