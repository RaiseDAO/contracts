// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// import "../../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
// import "../../node_modules/@openzeppelin/contracts/access/Ownable.sol";

import "./ERC20.sol";
import "../Ownable.sol";

contract RFIToken is ERC20, Ownable {
    
    constructor (string memory _name, string memory _symbol, address _owner, address[] memory _addresses) 
    ERC20(_name, _symbol)
    {
        require(_addresses.length != 0);

        _transferOwnership(_owner);

        for (uint256 i; i < _addresses.length; i++) {
            _mint(_addresses[i], 25000000 * 1000000000000000000);
        }
    }

    function mint(address _to, uint256 _amount) public onlyOwner {
        require(_to != address(0));
        require(_amount != 0);

        _mint(_to, _amount);
    }
}