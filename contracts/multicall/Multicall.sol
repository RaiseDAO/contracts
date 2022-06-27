// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../Utils/Libraries/Address.sol";

contract Multicall {
    function multicall(address[] calldata targets, bytes[] calldata data) external virtual returns (bytes[] memory results) {
        require(targets.length == data.length, "RF_MULTICALL: `targets` and `data` arrays must be the same size.");
        
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            require(targets[i] != address(0), "RF_MULTICALL: target address can not be address zero.");
            results[i] = Address.functionDelegateCall(targets[i], data[i]);
        }
        return results;
    }
}
