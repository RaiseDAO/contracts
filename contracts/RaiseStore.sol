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

    struct Store {
        bool isDynamicProductsAllowed;
        bool isDynamicSellerAllowed;
        address owner;
    }

    struct UserOrder {
        uint256 storeId;
        address sellerAddr;
        uint256 userId;
        OrderItem[] items;
    }

    struct OrderItem {
        uint256 collectionId;
        uint256 productId;
        address payToken;
        uint256 price;
        uint256 amount;
        bytes32 additionalInfo;
    }

    struct StoreProduct {
        uint256 collectionId;
        uint256 productId;
        bool isAvaiable;
        address payToken;
        uint256 price;
        bytes32 additionalInfo;
    }

    event UserBought(address sellerAddr, UserOrder order);
    event TokenWhitelisted(address token);
    event TokenBlacklisted(address token);
    event ProductRegistered(uint256 collectionId, uint256 productId, StoreProduct product);
    event ServiceFeeSet(uint256 serviceFeePromille);
    event StoreCreated(uint256 storeId, Store store);
    event StoreOwnerChanged(uint256 storeId, address newOwner);
    event NftUrlChanged(string uri);

    uint256 public serviceFeePromille;
    Store[] public stores;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => StoreProduct))) public products;  // store id => collection id => product id => item
    mapping(address => bool) public whitelistedTokens;

    constructor(uint256 serviceFeePromille_) ERC1155("https://api.raisepay.io/product/{id}.json") {
        serviceFeePromille = serviceFeePromille_;
    }

    function setServiceFee(uint256 serviceFeePromille_) public onlyOwner {
        serviceFeePromille = serviceFeePromille_;
        emit ServiceFeeSet(serviceFeePromille_);
    }

    function changeNftUrl(string calldata uri_) public onlyOwner {
        _setURI(uri_);
        emit NftUrlChanged(uri_);
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

    function createStore(bool isDynamicProductsAllowed, bool isDynamicSellerAllowed) public {
        uint256 storeId = stores.length;
        Store memory store = Store(isDynamicProductsAllowed, isDynamicSellerAllowed, msg.sender);

        stores.push(store);

        emit StoreCreated(storeId, store);
    }

    function changeStoreOwner(uint256 storeId, address newOwner) public {
        Store storage store = stores[storeId];

        require(store.owner == msg.sender, "Not the owner");

        store.owner = newOwner;

        emit StoreOwnerChanged(storeId, newOwner);
    } 

    function setProducts(uint256 storeId, StoreProduct[] calldata productsToRegister) public {
        Store memory store = stores[storeId];

        require(store.owner == msg.sender, "You're not the store owner");

        for(uint256 i = 0; i < productsToRegister.length; i++) {
            StoreProduct memory product = productsToRegister[i];

            require(whitelistedTokens[product.payToken], "Token is not whitelisted");

            products[storeId][product.collectionId][product.productId] = product;
            emit ProductRegistered(product.collectionId, product.productId, product);
        }
    }

    function setProductsAvailability(uint256 storeId, StoreProduct[] calldata productsToRegister) public {
        Store memory store = stores[storeId];
        
        require(store.owner == msg.sender, "You're not the store owner");

        for(uint256 i = 0; i < productsToRegister.length; i++) {
            StoreProduct memory product = productsToRegister[i];
            products[storeId][product.collectionId][product.productId].isAvaiable = product.isAvaiable;
            emit ProductRegistered(product.collectionId, product.productId, product);
        }
    }

    function buy(UserOrder calldata order) public {
        require(stores.length > order.storeId, "No such store");

        Store memory store = stores[order.storeId];

        require(store.owner == order.sellerAddr || store.isDynamicSellerAllowed, "Invalid seller address");

        for(uint256 i = 0; i < order.items.length; i++) {
            OrderItem memory item = order.items[i];
            StoreProduct memory registeredProduct = products[order.storeId][item.collectionId][item.productId];

            require(whitelistedTokens[item.payToken], "Token is not whitelisted");

            // Check either unregistered items are allowed or item is registered
            require(store.isDynamicProductsAllowed || registeredProduct.isAvaiable , "Only registered items allowed");

            // Item is registered
            if (registeredProduct.isAvaiable) {
                require(registeredProduct.payToken == item.payToken, "Invalid paytoken");
                require(registeredProduct.price == item.price, "Invalid price");
                require(registeredProduct.isAvaiable, "Item is not available");
            }

            _mint(msg.sender, uint256(keccak256(abi.encodePacked(order.storeId, item.collectionId, item.productId))), item.amount, "");

            uint256 sum = item.amount * item.price;
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
        uint256 storeId, 
        uint256 collectionId, 
        uint256 productId, 
        uint8 v, 
        bytes32 r, 
        bytes32 s, 
        uint256 timestamp, 
        uint256 maxTimeDelta
    ) 
        public view returns (bool)
    {
        uint256 balance = balanceOf(userAddress, uint256(keccak256(abi.encodePacked(storeId, collectionId, productId))));
        
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
