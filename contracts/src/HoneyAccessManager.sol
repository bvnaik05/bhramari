// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Bhramari institutional permissions. Deploy with a timelocked multisig as admin in a pilot.
contract HoneyAccessManager is AccessControlDefaultAdminRules, Pausable {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant PRODUCER_ROLE = keccak256("PRODUCER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant LAB_ROLE = keccak256("LAB_ROLE");
    bytes32 public constant RECALL_ROLE = keccak256("RECALL_ROLE");
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    constructor(address admin, uint48 transferDelay) AccessControlDefaultAdminRules(transferDelay, admin) {
        _grantRole(GUARDIAN_ROLE, admin);
    }

    function pause() external onlyRole(GUARDIAN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function requireRole(bytes32 role, address actor) external view {
        _requireNotPaused();
        _checkRole(role, actor);
    }
}
