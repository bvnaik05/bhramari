// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {HoneyAccessManager} from "./HoneyAccessManager.sol";
import {ParticipantRegistry} from "./ParticipantRegistry.sol";

contract EvidenceAnchor {
    struct Checkpoint { bytes32 root; uint32 count; uint64 blockNumber; uint64 timestamp; }
    struct Evidence { bytes32 subjectId; bytes32 digest; address issuer; uint64 validUntil; }
    HoneyAccessManager public immutable access;
    ParticipantRegistry public immutable participants;
    mapping(bytes32 => Checkpoint) public checkpoints;
    mapping(bytes32 => Evidence) public evidence;
    mapping(bytes32 => bool) public revoked;
    event CheckpointAnchored(bytes32 indexed id, bytes32 indexed root, uint32 count);
    event EvidenceRecorded(bytes32 indexed id, bytes32 indexed subjectId, bytes32 digest, address issuer, uint64 validUntil);
    event EvidenceRevoked(bytes32 indexed id, bytes32 reasonHash);

    constructor(HoneyAccessManager permissions, ParticipantRegistry registry) { access = permissions; participants = registry; }

    function anchorCheckpoint(bytes32 id, bytes32 root, uint32 count) external {
        access.requireRole(access.ANCHOR_ROLE(), msg.sender);
        require(id != bytes32(0) && root != bytes32(0) && count > 0, "Invalid checkpoint");
        require(checkpoints[id].root == bytes32(0), "Checkpoint immutable");
        checkpoints[id] = Checkpoint(root, count, uint64(block.number), uint64(block.timestamp));
        emit CheckpointAnchored(id, root, count);
    }

    function recordEvidence(bytes32 id, bytes32 subjectId, bytes32 digest, uint64 validUntil) external {
        participants.requireActiveRole(msg.sender, access.LAB_ROLE());
        require(id != bytes32(0) && subjectId != bytes32(0) && digest != bytes32(0), "Empty evidence");
        require(evidence[id].issuer == address(0) && validUntil > block.timestamp, "Duplicate/expired evidence");
        evidence[id] = Evidence(subjectId, digest, msg.sender, validUntil);
        emit EvidenceRecorded(id, subjectId, digest, msg.sender, validUntil);
    }

    function revokeEvidence(bytes32 id, bytes32 reasonHash) external {
        access.requireRole(access.RECALL_ROLE(), msg.sender);
        require(evidence[id].issuer != address(0) && reasonHash != bytes32(0), "Unknown evidence/reason");
        revoked[id] = true;
        emit EvidenceRevoked(id, reasonHash);
    }

    function verifyInclusion(bytes32 checkpointId, bytes32 leaf, bytes32[] calldata siblings) external view returns (bool) {
        require(siblings.length <= 32, "Proof too long");
        bytes32 computed = leaf;
        for (uint256 i; i < siblings.length; ++i) {
            computed = computed < siblings[i] ? sha256(abi.encodePacked(computed, siblings[i])) : sha256(abi.encodePacked(siblings[i], computed));
        }
        return checkpoints[checkpointId].root != bytes32(0) && checkpoints[checkpointId].root == computed;
    }
}
