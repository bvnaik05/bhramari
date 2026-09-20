// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BatchRegistry} from "./BatchRegistry.sol";

contract CustodyChain {
    enum Status { Unknown, Proposed, Accepted, Disputed, Cancelled }
    struct Handover { bytes32 batchId; address from; address to; uint64 expiresAt; Status status; bytes32 evidenceHash; }
    BatchRegistry public immutable batches;
    mapping(bytes32 => Handover) public handovers;
    mapping(bytes32 => bytes32) public pendingForBatch;
    event CustodyProposed(bytes32 indexed id, bytes32 indexed batchId, address from, address to, uint64 expiresAt, bytes32 evidenceHash);
    event CustodyResolved(bytes32 indexed id, Status status, bytes32 evidenceHash);

    constructor(BatchRegistry registry) { batches = registry; }

    function propose(bytes32 id, bytes32 batchId, address to, uint64 expiresAt, bytes32 evidenceHash) external {
        batches.participants().requireActiveRole(msg.sender, batches.access().OPERATOR_ROLE());
        batches.participants().requireActive(to);
        batches.requireUsable(batchId);
        require(batches.custodianOf(batchId) == msg.sender && to != msg.sender, "Not custodian/recipient");
        require(id != bytes32(0) && handovers[id].status == Status.Unknown && evidenceHash != bytes32(0), "Invalid handover");
        require(expiresAt > block.timestamp && expiresAt <= block.timestamp + 30 days, "Invalid expiry");
        bytes32 prior = pendingForBatch[batchId];
        require(prior == bytes32(0) || handovers[prior].expiresAt < block.timestamp, "Pending handover");
        handovers[id] = Handover(batchId, msg.sender, to, expiresAt, Status.Proposed, evidenceHash);
        pendingForBatch[batchId] = id;
        emit CustodyProposed(id, batchId, msg.sender, to, expiresAt, evidenceHash);
    }

    function accept(bytes32 id, bytes32 receiptHash) external {
        Handover storage handover = handovers[id];
        batches.participants().requireActiveRole(msg.sender, batches.access().OPERATOR_ROLE());
        require(handover.status == Status.Proposed && handover.to == msg.sender, "Not proposed recipient");
        require(block.timestamp <= handover.expiresAt && receiptHash != bytes32(0), "Expired/empty receipt");
        handover.status = Status.Accepted;
        delete pendingForBatch[handover.batchId];
        batches.settleCustody(handover.batchId, handover.from, msg.sender);
        emit CustodyResolved(id, Status.Accepted, receiptHash);
    }

    function dispute(bytes32 id, bytes32 reasonHash) external { _resolve(id, Status.Disputed, reasonHash); }
    function cancel(bytes32 id, bytes32 reasonHash) external { _resolve(id, Status.Cancelled, reasonHash); }

    function _resolve(bytes32 id, Status status, bytes32 reasonHash) private {
        Handover storage handover = handovers[id];
        batches.participants().requireActive(msg.sender);
        require(handover.status == Status.Proposed && reasonHash != bytes32(0), "Not proposed/empty reason");
        require(status == Status.Disputed ? msg.sender == handover.to : msg.sender == handover.from, "Not party");
        handover.status = status;
        if (pendingForBatch[handover.batchId] == id) delete pendingForBatch[handover.batchId];
        emit CustodyResolved(id, status, reasonHash);
    }
}
