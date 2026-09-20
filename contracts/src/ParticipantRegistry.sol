// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {HoneyAccessManager} from "./HoneyAccessManager.sol";

contract ParticipantRegistry {
    struct Participant { bytes32 organisation; bytes32 evidenceHash; uint64 registeredAt; bool active; }
    HoneyAccessManager public immutable access;
    mapping(address => Participant) public participants;
    event ParticipantRegistered(address indexed account, bytes32 indexed organisation, bytes32 evidenceHash);
    event ParticipantStatusChanged(address indexed account, bool active, bytes32 reasonHash);

    constructor(HoneyAccessManager permissions) { access = permissions; }

    function register(address account, bytes32 organisation, bytes32 evidenceHash) external {
        access.requireRole(access.REGISTRAR_ROLE(), msg.sender);
        require(account != address(0) && organisation != bytes32(0) && evidenceHash != bytes32(0), "Empty participant");
        require(participants[account].registeredAt == 0, "Participant exists");
        participants[account] = Participant(organisation, evidenceHash, uint64(block.timestamp), true);
        emit ParticipantRegistered(account, organisation, evidenceHash);
    }

    function setActive(address account, bool active, bytes32 reasonHash) external {
        access.requireRole(access.REGISTRAR_ROLE(), msg.sender);
        require(participants[account].registeredAt != 0 && reasonHash != bytes32(0), "Unknown participant/reason");
        participants[account].active = active;
        emit ParticipantStatusChanged(account, active, reasonHash);
    }

    function requireActive(address account) external view {
        require(!access.paused() && participants[account].active, "Inactive participant");
    }

    function requireActiveRole(address account, bytes32 role) external view {
        access.requireRole(role, account);
        require(participants[account].active, "Inactive participant");
    }
}
