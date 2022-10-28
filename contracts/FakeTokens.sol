//SPDX-License-Identifier: MIT
//@author asimaranov

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RaiseToken is ERC20, Ownable {
    constructor() ERC20("Raise", "RAISE") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    function mint(address user, uint256 amount) public onlyOwner {
        _mint(user, amount);
    }
}

contract FakeToken1 is ERC20 {
    constructor() ERC20("Fake1", "F1") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }
}

contract FakeToken2 is ERC20 {
    constructor() ERC20("Fake2", "F2") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }
}

contract FakeTokenUSDC is ERC20, Ownable {
    constructor() ERC20("USDC", "USDC") {
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function mint(address user, uint256 amount) public onlyOwner {
        _mint(user, amount);
    }


    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}

contract FakeTokenUSDT is ERC20, Ownable {
    constructor() ERC20("USDT", "USDT") {
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function mint(address user, uint256 amount) public onlyOwner {
        _mint(user, amount);
    }


    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}

contract FakeTokenDAI is ERC20, Ownable {
    constructor() ERC20("DAI", "DAI") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    function mint(address user, uint256 amount) public onlyOwner {
        _mint(user, amount);
    }


    function decimals() public view virtual override returns (uint8) {
        return 18;
    }
}