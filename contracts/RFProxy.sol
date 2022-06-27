// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IAdmin.sol";
import "./Utils/proxy_utils/ERC1967Proxy.sol";

contract RFProxy is ERC1967Proxy {
    bytes32 private constant _ADMIN = bytes32(uint256(keccak256("eip1967.RFProxy.admin")) - 1);

    modifier onlyAdmin {
        address admin = StorageSlot.getAddressSlot(_ADMIN).value;
        require(IAdmin(admin).isAdmin(msg.sender), "Only Admin can call this function");
        _;
    }

    constructor(address _logic, bytes memory _data, address _adminContract) ERC1967Proxy(_logic, _data) {
        StorageSlot.getAddressSlot(_ADMIN).value = _adminContract;
    }

    /**
        @dev Returns the current implementation address.
     */
    function implementation() external view returns(address _impl) {
        _impl = _implementation();
    }

    /**
        @dev Upgrades the proxy to the given implementation address.
        @param _newImplementation The new implementation address.
     */
    function upgradeTo(address _newImplementation) external onlyAdmin {
        _upgradeTo(_newImplementation);
    }

    /**
        @dev Upgrades the proxy to the given implementation address and calls it with the given data if provided.
        @param _newImplementation The new implementation address.
        @param _data The data to be passed to the call to the new implementation after upgrade.
        @param _forceCall Whether to force the call to the new implementation.
     */
    function upgradeToAndCall(address _newImplementation, bytes memory _data, bool _forceCall) external onlyAdmin {
        _upgradeToAndCall(_newImplementation, _data, _forceCall);
    }
    
    /**
        @dev Upgrades the proxy to the given implementation address and calls it with the given data if provided.
        @param _newImplementation The new implementation address.
        @param _data The data to be passed to the call to the new implementation after upgrade.
        @param _forceCall Whether to force the call to the new implementation.
     */
    function upgradeToAndCallUUPS(address _newImplementation, bytes memory _data, bool _forceCall) external onlyAdmin {
        _upgradeToAndCallUUPS(_newImplementation, _data, _forceCall);
    }

    /**
        @dev Returns beacon address.
     */
    function getBeacon() external view returns (address) {
        return _getBeacon();
    }

    /**
        @dev Sets the beacon address and makes a call if `_data` is provided or `_forceCall` is true.
        @param _newBeacon New beacon address.
        @param _data The data to be passed to the call to the new beacon after upgrade.
        @param _forceCall Whether to force the call to the new beacon.
     */
    function upgradeBeaconToAndCall(address _newBeacon, bytes memory _data, bool _forceCall) external onlyAdmin {
        _upgradeBeaconToAndCall(_newBeacon, _data, _forceCall);
    }

}