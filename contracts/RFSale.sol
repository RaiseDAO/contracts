// SPDX-License-Identifier: MIT
/**
    @title RFSale
    @author farruhsydykov
 */
pragma solidity ^0.8.0;

import "./cryptography/ECDSAUpgradeable.sol";
import "./UpgradeableUtils/PausableUpgradeable.sol";
import "./UpgradeableUtils/ReentrancyGuardUpgradeable.sol";
import "./UpgradeableUtils/SafeERC20Upgradeable.sol";
import "./UpgradeableUtils/MerkleProofUpgradeable.sol";

import "./interfaces/IAdmin.sol";
import "./interfaces/IRFSale.sol";
import "./interfaces/IRFSaleFactory.sol";
import "./interfaces/IRFAllocationStaking.sol";

contract RFSale is IRFSale, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Rounds must be set in correct order: MERCH => DEALER => BROKER => TYCOON.
    struct TierRoundInfo {
        // Which Tier can participate in this round.
        Tier roundForTier;
        // Amount of tokens available for tier.
        uint256 tokensAvailable;
        // Amount of tokens purchased by tier memebers.
        uint256 tokensPurchased;
        // Minimal amount of payment tokens user can purchase sale tokens for.
        uint256 minBuyAmountInPaymentTokens;
        // Maximal amount of payment tokens user can purchase sale tokens for.
        uint256 maxBuyAmountInPaymentTokens;
    }

    struct Participation {
        // Round index user participated in.
        // Merch - 0, Dealer - 1, Broker - 2, Tycoon - 3, Fan - 4
        uint256 roundIndex;
        // Amount of tickets user registered for whitelist
        uint256 ticketsAmount;
        // Amount of sale tokens bought.
        uint256 amountBought;
        // Amount of sale tokens userPaidFor.
        uint256 amountPayedFor;
        // Payment tokens amount payed for tokens.
        uint256 amountOfPaymentTokensPaid;
        // Timestamp when purchase was made.
        uint256 timeRegistered;
        // Was a portion withdrawn from vesting.
        bool[] isPortionWithdrawn;
    }

    // Merkle root hash for MERCHANTs.
    bytes32 public whitelistRootHashForMerchants;
    // Merkle root hash for DEALERs.
    bytes32 public whitelistRootHashForDealers;

    // Admin contract.
    IAdmin public admin;
    // Token in which payment for token sold will occure.
    IERC20Upgradeable public paymentToken;
    // Pointer to Sales Factory.
    IRFSaleFactory public salesFactory;
    // Pointer to Allocation staking contract, where tier and ticket information and will be retrieved from.
    IRFAllocationStaking public allocationStaking;
    // Address of tokens that is being sold.
    IERC20Upgradeable public saleToken;
    // Is sale created.
    bool public isSaleCreated;
    // Were sale tokens funded for sale.
    bool public saleFunded;
    // Is FAN round set
    bool public fanRoundSet;
    // Address of the sale owner (usually a member of the token team).
    address public saleOwner;
    // 10**18
    uint256 public ONE;
    // Price of sale token in payment tokens.
    uint256 public tokenPriceInPaymentToken;
    // Amount of sale tokens deposited for sale.
    uint256 public amountOfSaleTokensDeposited;
    // Amount of tokens sold.
    uint256 public amountOfSaleTokensSold;
    // Amount of payment tokens raised.
    uint256 public amountOfPaymentTokensRaised;
    // Timestamp when registration starts.
    uint256 public registrationTimeStarts;
    // Timestamp when registration ends.
    uint256 public registrationTimeEnds;
    // Number of users registered for sale. Include those who was not whitelisted.
    uint256 public numberOfRegistrants;
    // Precision for calculating tokensAvailable for TierRoundIndo.
    uint256 public precisionForTierRoundPortions;

    // Array of rounds.
    // Rounds must be set in correct order: MERCH => DEALER => BROKER => TYCOON => FAN.
    TierRoundInfo[] public rounds;
    // Mapping if user is registered or not.
    mapping(address => bool) public hasRegistered;
    // Mapping user to his participation.
    mapping(address => Participation) public userToParticipation;
    // Mapping of users who was not whitelisted and claimed their payment tokens.
    mapping(address => bool) public userClaimedPaymentTokens;
    // Mapping of signatures that were already used.
    mapping(bytes => bool) public usedSignatures;
    // Mapping of used message hashes.
    mapping(bytes32 => bool) public usedMessageHashes;
    // Times when portions are getting unlocked.
    uint256[] public vestingPortionsUnlockTime;
    // Percent of the participation user can withdraw.
    uint256[] public vestingPercentPerPortion;
    // All merchant users who have registered for sale.
    address[] public registeredMerchants;
    // All dealer users who have registered for sale.
    address[] public registeredDealers;
    // address of the backend.
    address public backend;

    // * * * EVENTS * * * //
    
    event SaleTokenSet(address indexed _saleToken);
    event TokenPriceSet(uint256 _prevPrice, uint256 _newPrice);
    event SaleFunded(address indexed _saleToken, uint256 _amountFunded);
    event WhitelistRootHashesSet(bytes32 _whitelistRootHashForMerchants, bytes32 _whitelistRootHashForDealers);
    event SaleCreated(
        address indexed _saleToken,
        address indexed _saleOwner,
        uint256 _tokenPriceInPaymentToken
    );
    event RoundSet(
        Tier indexed _roundForTier,
        address indexed _saleToken,
        uint256 _tokensAvailable,
        uint256 _minBuyAmountInPaymentToken,
        uint256 _maxBuyAmountInPaymentToken
    );
    event UserRegistered(
        address indexed _user,
        Tier indexed _tier,
        uint256 _saleTokensAmountPayedFor,
        uint256 _paymentTokensPayed
    );
    event RegistrationTimeSet (
        address indexed _saleToken,
        uint256 _registrationTimeStarts,
        uint256 _registrationTimeEnds
    );
    event VestingParamsSet(
        uint256[] _vestingPortionsUnlockTime,
        uint256[] _vestingPercentPerPortion
    );
    event RegistrationPeriodExtended(
        uint256 _prevRegistrationTimeStarts,
        uint256 _newRegistrationTimeStarts,
        uint256 _prevRegistrationTimeEnds,
        uint256 _newRegistrationTimeEnds
    );
    event SaleTokensWithdrawn(address indexed _user, uint256 _saleTokensAmount);
    event RaisedPaymentTokensWithdrawn(address indexed _user, uint256 _paymentTokensAmount);
    event WithdrawLeftoverSaleTokens(address indexed _user, uint256 _saleTokensAmount);

    // * * * MODIFIERS * * * //

    /**
        @dev Modifier to check if FAN round is already set.
     */
    modifier checkIsFanRoundSet(bool _withdraw) {
        string memory err = "Fan round must be set.";
        if (_withdraw) {
            err = "You can withdraw raised payment tokens only after fan round was set or sale finished.";
            require(fanRoundSet, err);
        }
        else {
            require(fanRoundSet, err);
        }
        _;
    }

    /**
        @dev Modifier that checks if sale sale token is already set.
     */
    modifier saleTokenIsSet() {
        require(address(saleToken) != address(0), "Sale token address must be set");
        _;
    }

    // * * * MODIFIERS AS FUNCTIONS * * * //

    /**
        @dev Function that serves as a modifer to check if regisrtation time is set.
     */
    function registrationTimeIsSet() private view {
        require(registrationTimeStarts != 0, "You must set registration time first.");
    }

    /**
        @dev Function that serves as a modifer to check if portions are already available.
     */
    function portionsAreAvailable() private view {
        require(
            block.timestamp >= vestingPortionsUnlockTime[0],
            "Vesting period has not yet come."
        );
    }

    /**
        @dev Function that serves as a modifer to check if the caller is sale owner.
     */
    function onlySaleOwner() private view {
        require(_msgSender() == saleOwner, "Only for sale owner.");
    }

    /**
        @dev Function that serves as a modifer to check if sale is already created.
     */
    function checkIsSaleCreated() private view {
        require(isSaleCreated, "Sale must be created");
    }

    /**
        @dev Function that serves as a modifer to check if caller is admin.
     */
    function onlyAdmin() private {
        require(
            admin.isAdmin(_msgSender()),
            "Only admin can call this function."
        );
    } 

    // * * * INITIALIZER * * * //

    /**
        @dev Contract initializer.
        @param _admin Admin contract address.
        @param _saleFactory Address of the sales factory.
        @param _allocationStaking Address of the allocationStaking contract.
        @param _backend Backend address.
     */
    function initialize(address _admin, address _saleFactory, address _allocationStaking, address _backend) external initializer {
        require(IAdmin(_admin).isAdmin(_msgSender()), "Only Admin can initialize this contract");
        require(_admin != address(0));
        require(_saleFactory != address(0));
        require(_allocationStaking != address(0));
        admin = IAdmin(_admin);
        salesFactory = IRFSaleFactory(_saleFactory);
        allocationStaking = IRFAllocationStaking(_allocationStaking);
        backend = _backend;

        __Context_init_unchained();
        __Pausable_init_unchained();
        __ReentrancyGuard_init_unchained();

        ONE = 1000000000000000000;
        precisionForTierRoundPortions = 10000;
    }

    // * * * EXTERNAL FUNCTIONS * * * //

    /**
        @dev Function to pause the contract.
     */
    function pause() external {
        onlyAdmin();
        _pause();
    }

    /**
        @dev Function to unpause the contract.
     */
    function unpause() external {
        onlyAdmin();
        _unpause();
    }

    /**
        @dev Function to set sale parameters.
        @param _saleToken Address of the token being sold.
        @param _paymentToken Address of the token in which payment for token sold will occure.
        @param _saleOwner Address of the sale owner.
        @param _tokenPriceInPaymentToken Token price in payment token.
     */
    function setSaleParams(
        address _saleToken,
        address _paymentToken,
        address _saleOwner,
        uint256 _tokenPriceInPaymentToken
    )
    external
    override
    {
        onlyAdmin();
        require(!isSaleCreated, "Sale is already created.");
        require(_saleOwner != address(0) && _paymentToken != address(0), "_saleOwner and _paymentToken can not be address(0).");

        if (_saleToken != address(0)) saleToken = IERC20Upgradeable(_saleToken);

        paymentToken = IERC20Upgradeable(_paymentToken);
        saleOwner = _saleOwner;
        tokenPriceInPaymentToken = _tokenPriceInPaymentToken;

        isSaleCreated = true;

        emit SaleCreated(_saleToken, _saleOwner, _tokenPriceInPaymentToken);
    }

    /**
        @dev Function to retroactively set sale token address, can be called only once,
        after initial contract creation has passed. Added as an options for teams which
        are not having token at the moment of sale launch.
        @param _saleToken Address of the token to be sold.
     */
    function setSaleToken(address _saleToken) external override {
        checkIsSaleCreated();
        onlyAdmin();
        require(address(saleToken) == address(0), "Sale token address is already set.");
        saleToken = IERC20Upgradeable(_saleToken);

        emit SaleTokenSet(_saleToken);
    }

    /**
        @dev Function for owner to deposit tokens, can be called only once.
        @param _amountFunded Amount of sale tokens to be funded.
        @notice Sale must be created & sale token must be set.
     */
    function fundSale(uint256 _amountFunded) external override saleTokenIsSet {
        checkIsSaleCreated();
        require(_msgSender() == saleOwner || admin.isAdmin(_msgSender()), "Only for sale owner.");
        require(saleFunded == false, "Sale is already funded");
        require(_amountFunded > 0, "Amount funded to sale must be greater than 0");

        amountOfSaleTokensDeposited = _amountFunded;
        saleFunded = true;

        saleToken.safeTransferFrom(_msgSender(), address(this), _amountFunded);

        emit SaleFunded(address(saleToken), _amountFunded);
    }

    /**
        @dev Function to set registration period.
        @param _registrationTimeStarts Timestamp when registration starts.
        @param _registrationTimeEnds Timestamp when registration ends.
     */
    function setRegistrationTime(
        uint256 _registrationTimeStarts,
        uint256 _registrationTimeEnds
    )
    external
    override {
        checkIsSaleCreated();
        onlyAdmin();
        require(registrationTimeStarts == 0, "Registration period is already set.");
        require(
            _registrationTimeStarts >= block.timestamp &&
            _registrationTimeEnds > _registrationTimeStarts,
            "Registration time starts must be earlier than it ends."    
        );

        // Set registration start and end time
        registrationTimeStarts = _registrationTimeStarts;
        registrationTimeEnds = _registrationTimeEnds;

        emit RegistrationTimeSet(address(saleToken), registrationTimeStarts, registrationTimeEnds);
    }

    /**
        @dev Set or reset vesting portions unlock time, percent per portion and vesting portion precision.
        @param _vestingPortionsUnlockTime Array of timestamps when vesting portions will be available.
        @param _vestingPercentPerPortion Array of portions available each vesting period.
        @param _initialSetup Must be true when setting up these values for the first time.
        @notice Make sure that summ of all vesting portions is equal to vesting precision.
        Make sure that all portions are set in whole numbers i.e. 833, not 833.333. 
        For example if there are 12 vesting periods vesting precision is 10,000
        then first 11 portions must be 833 and last one 837.
        @notice When resetting some of the values, MAKE SURE that arrays contain the same amount of values.
     */
    function setVestingParams(
        uint256[] memory _vestingPortionsUnlockTime,
        uint256[] memory _vestingPercentPerPortion,
        bool _initialSetup
    ) external override saleTokenIsSet {
        registrationTimeIsSet();
        checkIsSaleCreated();
        onlyAdmin();
        if (_initialSetup) {
            require(
                _vestingPortionsUnlockTime[0] > registrationTimeEnds,
                "Vesting starts earlier than registration ends."
            );
            require(
                _vestingPortionsUnlockTime.length == _vestingPercentPerPortion.length,
                "_vestingPortionsUnlockTime and _vestingPercentPerPortion must be the same length."
            );
        } else {
            require(
                vestingPortionsUnlockTime[0] != 0 && vestingPercentPerPortion[0] != 0,
                "Resetting vesting parameters can be doe only they were already set."
            );
            require(
                vestingPortionsUnlockTime[0] > block.timestamp,
                "Vesting params can be reset only if first portion is not yet available."
            );
            require(
                _vestingPortionsUnlockTime.length != 0 || vestingPortionsUnlockTime.length != 0,
                "At least one of the arrays must be provided."
            );
        }
        
        uint256 portionsSum;
        uint256 lastTimestamp = block.timestamp;

        for (uint i = 0; i < _vestingPortionsUnlockTime.length; i++) {
            
            if (_vestingPortionsUnlockTime.length > 0) {
                require(
                    lastTimestamp < _vestingPortionsUnlockTime[i],
                    "One of _vestingPortionsUnlockTime members is earlier than previous."
                );
                vestingPortionsUnlockTime.push(_vestingPortionsUnlockTime[i]);
                
                lastTimestamp = _vestingPortionsUnlockTime[i];
            }
            
            if (_vestingPercentPerPortion.length > 0) {
                vestingPercentPerPortion.push(_vestingPercentPerPortion[i]);

                portionsSum += _vestingPercentPerPortion[i];
            }
        }

        if (_vestingPercentPerPortion.length != 0) require(portionsSum == precisionForTierRoundPortions, "Sum of all portions is not 100%.");

        emit VestingParamsSet(_vestingPortionsUnlockTime, _vestingPercentPerPortion);
    }

    /**
        @dev Setting sale rounds for tiered users.
        @param _portionsOfTotalAmountOfTokensPerRound Array of tokens portions available per round.
        Must be provided as 1000 per 10% i.e. 2450 for 24.5% of total tokens amount.
        Portions for tier rounds must be correlated to 100% i.e. 35% of 70% for tiers must be set as 2450 (24.5%)
        from the whole amount.
        @param _minBuyAmountInPaymentToken Minimal amount of payment tokens to pay for a purchase.
        @param _maxBuyAmountInPaymentToken Maximal amount of payment tokens to pay for a purchase.
        @notice All arrays must be the same size and their size must be 4, one for each tier starting from
        MERCHANT => DEALER => BROKER => TYCOON.
        ! ! ! You can only set rounds once ! ! !
     */
    function setTierRoundInfo(
        uint256[] calldata _portionsOfTotalAmountOfTokensPerRound,
        uint256[] calldata _minBuyAmountInPaymentToken,
        uint256[] calldata _maxBuyAmountInPaymentToken
    ) external override {
        checkIsSaleCreated();
        onlyAdmin();
        require(rounds.length == 0, "Rounds were already set.");
        require(saleFunded, "Sale must be funded.");
        require(
            _portionsOfTotalAmountOfTokensPerRound.length == 4 &&
            _portionsOfTotalAmountOfTokensPerRound.length == _minBuyAmountInPaymentToken.length &&
            _minBuyAmountInPaymentToken.length == _maxBuyAmountInPaymentToken.length,
            "Both arrays length must be equal to 4 and same length."
        );

        uint256 sum;
        for (uint256 i = 0; i < _portionsOfTotalAmountOfTokensPerRound.length; i++) {
            sum += _portionsOfTotalAmountOfTokensPerRound[i];
        }

        require(sum == precisionForTierRoundPortions, "Summ of all portions is not 100%");

        Tier tier;
        uint256 tokensAvailable;

        for (uint256 i = 0; i < _portionsOfTotalAmountOfTokensPerRound.length; i++) {
            sum += _portionsOfTotalAmountOfTokensPerRound[i];

            require(
                _minBuyAmountInPaymentToken[i] > 0 &&
                _minBuyAmountInPaymentToken[i] < _maxBuyAmountInPaymentToken[i] &&
                _portionsOfTotalAmountOfTokensPerRound[i] > 0,
                "_minBuyAmountInPaymentToken is zero, _minBuyAmountInPaymentToken is higher than _maxBuyAmountInPaymentToken or one of _portionsOfTotalAmountOfTokensPerRound is zero."
            );

            if (i == 0) tier = Tier.MERCHANT;
            if (i == 1) tier = Tier.DEALER;
            if (i == 2) tier = Tier.BROKER;
            if (i == 3) tier = Tier.TYCOON;

            tokensAvailable = 
                amountOfSaleTokensDeposited * _portionsOfTotalAmountOfTokensPerRound[i] / precisionForTierRoundPortions;

            // Create round
            TierRoundInfo memory round = TierRoundInfo({
                roundForTier: tier,
                tokensAvailable: tokensAvailable,
                tokensPurchased: 0,
                minBuyAmountInPaymentTokens: _minBuyAmountInPaymentToken[i],
                maxBuyAmountInPaymentTokens: _maxBuyAmountInPaymentToken[i]
            });

            // Push this round to rounds array
            rounds.push(round);

            // Emit event
            emit RoundSet(tier, address(saleToken), tokensAvailable, _minBuyAmountInPaymentToken[i], _maxBuyAmountInPaymentToken[i]);
        }
    }

    /**
        @dev Function to purchase a portion. MERCHANTs and DEALERs are only registered for further ruffle.
        @param _paymentTokenAmountToPay Amount of payment tokens user is willing to pay. 
     */
    function registerForSale(uint256 _paymentTokenAmountToPay) external override whenNotPaused {
        checkIsSaleCreated();
        require(_paymentTokenAmountToPay != 0, "You can't pay 0 payment tokens.");

        Tier tier = allocationStaking.getCurrentTier(_msgSender());

        uint256 roundIndex;
        if (tier == Tier.MERCHANT) roundIndex = 0;
        if (tier == Tier.DEALER) roundIndex = 1;
        if (tier == Tier.BROKER) roundIndex = 2;
        if (tier == Tier.TYCOON) roundIndex = 3;
        if (tier == Tier.FAN) roundIndex = 4;

        if (roundIndex == 4) require(fanRoundSet, "Fan round has not yet started."); 

        _registerUser(roundIndex, _paymentTokenAmountToPay);

        numberOfRegistrants++;
    }

    /**
        @dev Function get all addresses registered for sale as merchants.
        @param _startIndex Index of the first address to return.
        @param _endIndex Index of the last address to return.
     */
    function getRegisteredMerchantsAddresses(uint256 _startIndex, uint256 _endIndex) external override view returns (address[] memory _addresses) {
        require(block.timestamp >= registrationTimeEnds, "You can only get registered merchants after registration time ends.");
        require(registeredMerchants.length != 0, "There is nothing to request.");
        require(
            _startIndex < _endIndex,
            "Requested starting index must be less than endin index."
        );

        uint256 counter;
        for (uint i; i < registeredMerchants.length; i++) {
            if (registeredMerchants[i] != address(0)) counter++;
        }

        address[] memory addresses_ = new address[](counter);

        uint256 j;
        for (uint256 i = _startIndex; (i < _endIndex && i < registeredMerchants.length); i++) {
            addresses_[j] = registeredMerchants[i];
            j++;
        }
        _addresses = addresses_;
        return _addresses;
    }

    /**
        @dev Function get all addresses registered for sale as dealers.
        @param _startIndex Index of the first address to return.
        @param _endIndex Index of the last address to return.
     */
    function getRegisteredDealersAddresses(uint256 _startIndex, uint256 _endIndex) external override view returns (address[] memory _addresses) {
        require(block.timestamp >= registrationTimeEnds, "You can only get registered merchants after registration time ends.");
        require(registeredDealers.length != 0, "There is nothing to request.");
        require(
            _startIndex < _endIndex,
            "Requested starting index must be less than endin index."
        );

        uint256 counter;
        for (uint i; i < registeredDealers.length; i++) {
            if (registeredDealers[i] != address(0)) counter++;
        }

        address[] memory addresses_ = new address[](counter);

        uint256 j;
        for (uint256 i = _startIndex; (i < _endIndex && i < registeredDealers.length); i++) {
            addresses_[j] = registeredDealers[i];
            j++;
        }
        _addresses = addresses_;
        return _addresses;
    }

    /**
        @dev Function to claim available for withdrawal tokens.
        @param _merkleProof Merkle proof of the user's participation in the round.
        @param _hash Message hash.
        @param _signature Signature of the user.
     */
    function claimTokens(bytes32[] calldata _merkleProof, bytes32 _hash, bytes memory _signature) external override nonReentrant whenNotPaused {
        require(usedSignatures[_signature] == false, "Signature is already used.");
        require(usedMessageHashes[_hash] == false, "Message hash is already used.");
        require(_isSignedByBackend(_hash, _signature), "Message must be signed by backend.");
        usedSignatures[_signature] = true;
        usedMessageHashes[_hash] = true;

        // check if vesting portions are already unlocked
        portionsAreAvailable();
        Participation storage p = userToParticipation[_msgSender()];
        TierRoundInfo storage r = rounds[p.roundIndex];

        // checking if user is registered for a sale
        // _userRegisteredForSale(_msgSender(), false);
        require(hasRegistered[_msgSender()], "You are not registered for a sale.");
        
        // checking if user has already claimed all tokens portions
        require(!userClaimedPaymentTokens[_msgSender()], "User has already claimed his payment tokens.");
        // check if whitelist root hash is already set
        isWhitelistRootHashSet();

        if (r.roundForTier == Tier.MERCHANT || r.roundForTier == Tier.DEALER) {
            require(_merkleProof.length != 0, "Merkle proof must be provided for MERCHNATS and DEALERS.");
            bool isWhitelisted = checkWhitelist(_msgSender(), _merkleProof, userToParticipation[_msgSender()].roundIndex);
            
            if (isWhitelisted == false) {
                require(p.isPortionWithdrawn[0] != true, "You have already claimed a portion.");
                userClaimedPaymentTokens[_msgSender()] = true;
                // transfer users payment tokens
                paymentToken.safeTransfer(_msgSender(), p.amountOfPaymentTokensPaid);
                return;
            }
        }

        // amount user can withdraw from vesting
        uint256 amountToWithdraw;
        for (uint256 i; i < vestingPortionsUnlockTime.length; i++) {
            if (i == 0 && p.isPortionWithdrawn[i] != true && r.roundForTier == Tier.MERCHANT || r.roundForTier == Tier.DEALER) {
                // if Merchant or Dealer were whitelisted and claimed their
                // sale tokens increase p.amountBought and
                // r.tokensPurchased only once to avoid overflows
                p.amountBought = p.amountPayedFor;
                r.tokensPurchased += p.amountBought;
                // instead of next line, total amount of payment tokens raised
                // by Merchants and Dealers will be incremented in setWhitelistRootHash()
            }
            if (vestingPortionsUnlockTime[i] <= block.timestamp && p.isPortionWithdrawn[i] != true) {
                // adding available portion to amount that is now available to withdraw
                amountToWithdraw += p.amountBought * vestingPercentPerPortion[i] / precisionForTierRoundPortions;
                // setting this portion as already withdrawn
                p.isPortionWithdrawn[i] = true;
            }
            if (i == vestingPortionsUnlockTime.length - 1 && p.isPortionWithdrawn[vestingPortionsUnlockTime.length - 1] == true) {
                // if user has already withdrawn all portions
                // set userClaimedPaymentTokens to true
                userClaimedPaymentTokens[_msgSender()] = true;
            }
        }
        // checking if user has any available portions to withdraw
        require(amountToWithdraw != 0, "There is no more available tokens to withdraw yet.");

        saleToken.safeTransfer(_msgSender(), amountToWithdraw);

        emit SaleTokensWithdrawn(_msgSender(), amountToWithdraw);
    }

    /**
        @dev Returns user's information on vesting portions.
        @param _user Address of the user who's portions are checked.
        @return arePortionsWithdrawn_ Array of booleans representing how much portions are available and if they are withdrawn. 
     */
    function getUserPortionsInfo(address _user) external override view whenNotPaused returns(bool[] memory arePortionsWithdrawn_) {
        portionsAreAvailable();
        Participation storage p = userToParticipation[_user];
        
        arePortionsWithdrawn_ = p.isPortionWithdrawn;

        return arePortionsWithdrawn_;
    }

    /**
        @dev Function to set FAN round.
        @param _minBuyAmountInPaymentToken Minimum amount of payment tokens user need to pay to participate in FAN round.
        @param _maxBuyAmountInPaymentToken Maximum amount of payment tokens user need to pay to participate in FAN round.
     */
    function startFanRound(
        uint256 _minBuyAmountInPaymentToken,
        uint256 _maxBuyAmountInPaymentToken
    )
    external
    override {
        onlyAdmin();
        // calculate how many tokens left arfter tier rounds bought
        uint256 tokensLeftAfterRegistrationPeriod = amountOfSaleTokensDeposited - amountOfSaleTokensSold;

        require(
            tokensLeftAfterRegistrationPeriod != 0 &&
            saleToken.balanceOf(address(this)) - amountOfSaleTokensSold == tokensLeftAfterRegistrationPeriod &&
            _minBuyAmountInPaymentToken < _maxBuyAmountInPaymentToken &&
            isWhitelistRootHashSet(),
            "Whitelist root hash is not set, there are no tokens left after registration period or min buy amount is bigger than max buy amout."
        );
        
        // Create round
        TierRoundInfo memory round = TierRoundInfo({
            roundForTier: Tier.FAN,
            tokensAvailable: tokensLeftAfterRegistrationPeriod,
            tokensPurchased: 0,
            minBuyAmountInPaymentTokens: _minBuyAmountInPaymentToken,
            maxBuyAmountInPaymentTokens: _maxBuyAmountInPaymentToken
        });
        // Push this round to rounds array
        rounds.push(round);
        // Set fanRoundSet as true
        fanRoundSet = true;
    }

    /**
        @dev Function to withdraw leftover sale tokens.
     */
    function withdrawLeftoverSaleTokens() external override {
        onlySaleOwner();
        require(fanRoundSet);
        require(vestingPortionsUnlockTime[1] <= block.timestamp, "Leftover sale tokens can be withdrawn only after first vesting portion is unlocked.");
        uint256 leftOverSaleTokens = amountOfSaleTokensDeposited - amountOfSaleTokensSold;
        require(leftOverSaleTokens != 0, "There are no sale tokens to withdraw.");

        // transfer sale tokens to sale owner
        saleToken.safeTransfer(saleOwner, leftOverSaleTokens);
        // emitting event
        emit WithdrawLeftoverSaleTokens(saleOwner, leftOverSaleTokens);
    }

    /**
        @dev Function to withdraw payment tokens raised
     */
    function withdrawPaymentTokensRaised() external override nonReentrant checkIsFanRoundSet(true) {
        onlyAdmin();
        require(
            amountOfPaymentTokensRaised != 0,
            "There is no more available tokens to withdraw yet."
        );
        // transfer payment tokens to sale owner
        uint256 amountToWithdraw = amountOfPaymentTokensRaised;
        // set amountOfPaymentTokensRaised to 0
        amountOfPaymentTokensRaised = 0;

        paymentToken.safeTransfer(saleOwner, amountToWithdraw);

        emit RaisedPaymentTokensWithdrawn(_msgSender(), amountToWithdraw);
    }

    /**
        @dev Function to set whitelist root hashes and increase total amount of purchased tokens.
        @param _amountOfTokensPurchasedByMerchants Calculated amount of tokens purchased by all whitelisted merchants.
        @param _amountOfTokensPurchasedByDealers Calculated amount of tokens purchased by all whitelisted dealers.
        @param _whitelistRootHashForMerchant Whitelist root hash for merchants.
        @param _whitelistRootHashForDealer Whitelist root hash for dealers.
     */
    function setWhitelistRootHashes(
        uint256 _amountOfTokensPurchasedByMerchants,
        uint256 _amountOfTokensPurchasedByDealers,
        bytes32 _whitelistRootHashForMerchant,
        bytes32 _whitelistRootHashForDealer
    )
    external
    override {
        onlyAdmin();
        require(
            _amountOfTokensPurchasedByMerchants <= rounds[0].tokensAvailable &&
            _amountOfTokensPurchasedByDealers <= rounds[1].tokensAvailable,
            "Amounts given for tiers exceed their maximum allowed values."
        );
        // check if registration period ended and whitelis root hashes are set
        require(block.timestamp >= registrationTimeEnds && !isWhitelistRootHashSet(), "Registration time has not finished or whitelists are already set.");

        // increasing amount of payment tokens raised by Merchants and Dealers
        amountOfPaymentTokensRaised += _amountOfTokensPurchasedByMerchants + _amountOfTokensPurchasedByDealers;
        // increase amount of sale tokens sold
        amountOfSaleTokensSold += _amountOfTokensPurchasedByMerchants + _amountOfTokensPurchasedByDealers;

        whitelistRootHashForMerchants = _whitelistRootHashForMerchant;
        whitelistRootHashForDealers = _whitelistRootHashForDealer;

        emit WhitelistRootHashesSet(_whitelistRootHashForMerchant, _whitelistRootHashForDealer);
    }

    /**
        @dev Function to change sale token price in payment token.
        @param _newPrice New price of sale token in payment token.
     */
    function updateTokenPriceInPaymentToken(uint256 _newPrice) external override {
        onlyAdmin();
        if (registrationTimeStarts != 0) {
            require(
                block.timestamp < registrationTimeStarts,
                "Token price is not yet set, _newPrice is 0 or registration has already started."
            );
        }

        uint256 prevPrice = tokenPriceInPaymentToken;
        tokenPriceInPaymentToken = _newPrice;

        emit TokenPriceSet(prevPrice, _newPrice);
    }

    /**
        @dev Function that can extend or postpone registration period.
        @param _timeToAdd Amount of time to add to registration period.
        @param _postpone if true, then change registrationTimeStarts also.
        @notice If _postpone is true, then _timeToAdd is added to registrationTimeStarts.
     */
    function extendRegistrationPeriod(uint256 _timeToAdd, bool _postpone) external override {
        registrationTimeIsSet();
        onlyAdmin();
        // check if registration has not yet ended
        require(
            registrationTimeEnds > block.timestamp,
            "You can change registration period only if it is not yet finished."
        );
        // check if registrationTimeEnds does not collide with first vesting period OR postpone it too
        require(
            registrationTimeEnds + _timeToAdd <= vestingPortionsUnlockTime[0],
            "You can postpone registration only if it does not collide with first vesting period."
        );

        uint256 prevRegistrationTimeStarts = registrationTimeStarts;
        uint256 prevRegistrationTimeEnds = registrationTimeEnds;

        // if _postpone is true, then add _timeToAdd to registrationTimeStarts
        if (_postpone) {
            // check if registration has not yet started
            require(
                block.timestamp < registrationTimeStarts,
                "You can only extend and not postpone registration period if it has already started."
            );
            // increase registrationTimeStarts timestamp
            registrationTimeEnds += _timeToAdd;
        }
        // increase registrationTimeEnds timestamp
        registrationTimeEnds += _timeToAdd;

        emit RegistrationPeriodExtended(
            prevRegistrationTimeStarts,
            registrationTimeStarts,
            prevRegistrationTimeEnds,
            registrationTimeEnds
        );
    }

    /**
        @dev Function that returns informatiob about rounds.
        @param _roundId Index of requested round information. 
        @return _tokensAvailable Amount of tokens available in the round.
        @return _tokensPurchased Amount of tokens purchased in the round.
        @return _minBuyAmountInPaymentTokens Minimum amount of payment tokens a user has to pay to participate in the round.
        @return _maxBuyAmountInPaymentTokens Maximum amount of payment tokens a user has to pay to participate in the round.
     */
    function getRoundInfo(uint256 _roundId) external override view returns(
        uint256 _tokensAvailable,
        uint256 _tokensPurchased,
        uint256 _minBuyAmountInPaymentTokens,
        uint256 _maxBuyAmountInPaymentTokens
    ) {
        require(rounds.length > 0, "Tier rounds are not yet set.");
        require(_roundId < rounds.length, "There is no round with this index.");

        TierRoundInfo storage round = rounds[_roundId];

        _tokensAvailable = round.tokensAvailable;
        _tokensPurchased = round.tokensPurchased;
        _minBuyAmountInPaymentTokens = round.minBuyAmountInPaymentTokens;
        _maxBuyAmountInPaymentTokens = round.maxBuyAmountInPaymentTokens;
    }

    /**
        @dev Function to check vesting portions unlock times and their percentages.
        @return vestingPortionsUnlockTime_ Array of timestamps when each portion will be unlocked.
        @return vestingPercentPerPortion_ Array of portions of purchased tokens that will be available each vesting period.
     */
    function getVestingInfo() external override view returns(uint256[] memory vestingPortionsUnlockTime_, uint256[] memory vestingPercentPerPortion_) {
        require(vestingPortionsUnlockTime.length != 0, "Vesting info is not yet set");

        vestingPortionsUnlockTime_ = vestingPortionsUnlockTime;
        vestingPercentPerPortion_ = vestingPercentPerPortion;

        return(
            vestingPortionsUnlockTime_,
            vestingPercentPerPortion_
        );
    }

    /**
        @dev Function to change backend address.
        @param _backendAddress New backend address.
     */
    function changeBackendAddress(address _backendAddress) external override {
        onlyAdmin();
        require(
            _backendAddress != address(0),
            "Backend address cannot be 0."
        );

        backend = _backendAddress;
    }

    // * * * PUBLIC FUNCTIONS * * * //

    /**
        @dev Function to get registration information of user.
        @param _user Address of the user whos info to get.
        @return roundId_ Id of the round user has participated.
        @return ticketsAmount_ Amount of tickets Merchant and Dealer users got when registered for sale.
        @return amountPayedFor_ Amount of tokens user paid for. 
        @notice Round ids are as followed:
        Merch - 0, Dealer - 1, Broker - 2, Tycoon - 3, Fan - 4.
     */
    function getUsersRegistryInfo(address _user)
    public
    override
    view
    returns(uint256 roundId_, uint256 ticketsAmount_, uint256 amountPayedFor_) {
        Participation storage p = userToParticipation[_user];

        _userRegisteredForSale(_user, false);

        return (
            p.roundIndex,
            p.ticketsAmount,
            p.amountPayedFor
        );
    }

    /**
        @dev Calls internal _checkWhitelist function depending in the _roundId user is participating.
        @param _user Address of the user to check if he is whitelisted.
        @param _merkleProof Merkle proof.
        @param _roundId 0 for Merchants, 1 for Dealers.
     */
    function checkWhitelist(
        address _user,
        bytes32[] calldata _merkleProof,
        uint256 _roundId
    )
    public
    override
    view
    returns(bool _userInWhitelist) {
        bytes32 rootHash;
        if (_roundId == 0) rootHash = whitelistRootHashForMerchants;
        else if (_roundId == 1) rootHash = whitelistRootHashForDealers;
        else revert("Incorrect round id provided.");

        require(rootHash[0] != 0, "Whitelist root hash is not yet set for this Tier.");

        // Compute merkle leaf from input
        bytes32 leaf = keccak256(abi.encodePacked(_user));
        // Verify merkle proof
        return MerkleProofUpgradeable.verify(_merkleProof, rootHash, leaf);
    }

    /**
        @dev Function to check if whitelist root hashes are set.
     */
    function isWhitelistRootHashSet() public override view returns(bool) {
        if (whitelistRootHashForMerchants[0] == 0 && whitelistRootHashForDealers[0] == 0)
        {
            return false;
        } else return true; 
    }

    // * * * INTERNAL FUNCTIONS * * * //

    /**
        @dev Internal function for registering a user depending on his/her tier.
        @param _roundIndex Index of the round user is registering.
        @param _paymentTokenAmount Amount of payment tokens user is willing to pay.
     */
    function _registerUser(uint256 _roundIndex, uint256 _paymentTokenAmount) internal {
        TierRoundInfo storage r = rounds[_roundIndex];
        Participation storage p = userToParticipation[_msgSender()];

        // setting this participation round index
        p.roundIndex = _roundIndex;
        // check if user has already registered
        _userRegisteredForSale(_msgSender(), true);
        // checking if user attempts to pay in the allowed range 
        require(
            _paymentTokenAmount >= r.minBuyAmountInPaymentTokens &&
            _paymentTokenAmount <= r.maxBuyAmountInPaymentTokens,
            "Amount of tokens to buy is not in allowed range."
        );

        if (_roundIndex != 4) {
            // check if current timestamp is in the registration period range
            require(
                block.timestamp >= registrationTimeStarts && block.timestamp <= registrationTimeEnds,
                "You can only register during registration time period."
            );
        } else {
            require(
                block.timestamp <= vestingPortionsUnlockTime[0] &&
                fanRoundSet &&
                allocationStaking.fanStakedForTwoWeeks(_msgSender()),
                "Fan round is not set, user hasn't staked RAISE for wto weeks or first portion is already unlocked."
            );
        }

        // calculate amount of sale tokens to buy
        uint256 tokensToBuy = _paymentTokenAmount * tokenPriceInPaymentToken / ONE;

        if (_roundIndex == 2 || _roundIndex == 3 || _roundIndex == 4) {
            // checking if there is enough sale tokens to purchase
            require(
                r.tokensAvailable - r.tokensPurchased >= tokensToBuy,
                "Not enought tokens left in this round."
            );
            // add amount of tokens purchased
            r.tokensPurchased += tokensToBuy;
            // as amountOfPaymentTokensRaised can be raised during registraion without
            // issues only when FANs, BROKERs and TYCOONs are registering, raising this value
            // for MERCHANTs and DEALERs accures while whitelists setting 
            amountOfPaymentTokensRaised += _paymentTokenAmount;
            // increasing amount of sale tokens sold
            amountOfSaleTokensSold += tokensToBuy;

            // add sale token purchased amount in round
            p.amountBought += tokensToBuy;
        }

        if (_roundIndex < 2) {
            p.ticketsAmount = allocationStaking.getTicketAmount(_msgSender());
            // saving merchant user's addresses for easier access when creating a merkle tree.
            if (_roundIndex == 0) registeredMerchants.push(_msgSender());
            // saving dealer user's addresses for easier access when creating a merkle tree.
            if (_roundIndex == 1) registeredDealers.push(_msgSender());
        }

        p.amountOfPaymentTokensPaid += _paymentTokenAmount;
        p.amountPayedFor += tokensToBuy;
        p.timeRegistered = block.timestamp;
        p.isPortionWithdrawn = new bool[](vestingPortionsUnlockTime.length);

        // setting user as already registered
        hasRegistered[_msgSender()] = true;
        // transfer payment tokens from user
        paymentToken.safeTransferFrom(_msgSender(), address(this), _paymentTokenAmount);
        // emitting event
        emit UserRegistered(_msgSender(), r.roundForTier, tokensToBuy, _paymentTokenAmount);
    }


    /**
        @dev Internal function that check if user is registered for sale.
        @param _user Address of user.
        @param _reversed Reverts if user is not registered for sale.
     */
    function _userRegisteredForSale(address _user, bool _reversed) internal view {
        if (_reversed) require(!hasRegistered[_user], "User is already registered for sale.");
        else require(hasRegistered[_user], "User is not registered for sale.");
    }

    /**
        @dev Internal function that checks if signature was created by the correct address.
        @param _hash Mesage hash.
        @param _signature Signature of the backend address.
     */
    function _isSignedByBackend(bytes32 _hash, bytes memory _signature) internal view returns(bool) {
        address signer = _recoverSigner(_hash, _signature);
        return signer == backend;
    }
    
    /**
        @dev Internal function that checks that recovers the signer of the message.
        @param _hash Mesage hash.
        @param _signature Signature of the backend address.
     */
    function _recoverSigner(bytes32 _hash, bytes memory _signature) internal pure returns(address) {
        bytes32 messageDigest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32", 
                _hash
            )
        );
        return ECDSAUpgradeable.recover(messageDigest, _signature);
    }
    
}