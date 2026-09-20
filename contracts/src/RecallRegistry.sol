// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BatchRegistry} from "./BatchRegistry.sol";

contract RecallRegistry {
    // 0 = released, 1 = hold, 2 = recall. A recall is irreversible.
    BatchRegistry public immutable batches;
    mapping(bytes32 => uint8) public ownStatus;
    event SafetyStatusChanged(bytes32 indexed id, uint8 status, bytes32 reasonHash, address authority);

    constructor(BatchRegistry registry) { batches = registry; }

    function setStatus(bytes32 id, uint8 status, bytes32 reasonHash) external {
        batches.access().requireRole(batches.access().RECALL_ROLE(), msg.sender);
        require(batches.custodianOf(id) != address(0), "Unknown batch");
        require(status <= 2 && reasonHash != bytes32(0) && ownStatus[id] != 2, "Invalid/irreversible status");
        ownStatus[id] = status;
        emit SafetyStatusChanged(id, status, reasonHash, msg.sender);
    }

    function effectiveStatus(bytes32 id) external view returns (uint8 status) {
        status = ownStatus[id];
        bytes32[] memory ancestry = batches.getAncestors(id);
        for (uint256 i; i < ancestry.length; ++i) if (ownStatus[ancestry[i]] > status) status = ownStatus[ancestry[i]];
    }
}
