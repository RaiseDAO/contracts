// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IAdmin {
    function isAdmin(address _user) external returns(bool _isAdmin);
    function addAdmin(address _adminAddress) external;
    function removeAdmin(address _adminAddress) external;
    function getAllAdmins() external view returns(address [] memory);
}