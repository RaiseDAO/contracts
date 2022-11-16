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

contract FakeStRaise is ERC20, Ownable {
    address public stakingAddr;
    mapping(address => uint256) public lockedTokens;
    constructor(address stakingAddr_) ERC20("St Raise", "stRAISE") {
        _mint(msg.sender, 100 * 10 ** 18);
        stakingAddr = stakingAddr_;
    }

    function mint(address user, uint256 amount) public onlyOwner {
        _mint(user, amount);
    }

    function mintOnStake(address user, uint256 amount) public {
        require(msg.sender == stakingAddr, "Only staking can mint this way");
        _mint(user, amount);
        lockedTokens[user] += amount;
    }

    function burnOnUnstake(address user, uint256 amount) public {
        require(msg.sender == stakingAddr, "Only staking can mint this way");
        _burn(user, amount);
        lockedTokens[user] -= amount;
    }

    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        address owner_ = _msgSender();
        _transfer(owner_, to, amount);

        require(balanceOf(msg.sender) >= lockedTokens[msg.sender], "Unable to transfer locked tokens");

        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);

        require(balanceOf(from) >= lockedTokens[from], "Unable to transfer locked tokens");

        return true;
    }
}

contract FakeTRaise is ERC20, Ownable {
    constructor() ERC20("TRaise", "TRaise") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    function mint(address user, uint256 amount) public onlyOwner {
        _mint(user, amount);
    }
}
