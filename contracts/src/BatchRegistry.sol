// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {HoneyAccessManager} from "./HoneyAccessManager.sol";
import {ParticipantRegistry} from "./ParticipantRegistry.sol";

interface RestrictionRegistry { function effectiveStatus(bytes32 id) external view returns (uint8); }
interface CustodyRegistry { function pendingForBatch(bytes32 id) external view returns (bytes32); }

contract BatchRegistry {
    struct Batch { address custodian; uint128 quantity; uint128 available; uint8 product; bytes32 evidenceHash; }
    HoneyAccessManager public immutable access;
    ParticipantRegistry public immutable participants;
    mapping(bytes32 => Batch) public batches;
    mapping(bytes32 => bytes32[]) private parents;
    mapping(bytes32 => bytes32[]) private ancestors;
    address public blendRegistry;
    address public custodyChain;
    RestrictionRegistry public recallRegistry;
    event BatchCreated(bytes32 indexed id, address indexed custodian, uint8 product, uint128 grams, bytes32 evidenceHash);
    event QuantityConsumed(bytes32 indexed id, uint128 grams, uint128 remaining);
    event CustodianChanged(bytes32 indexed id, address indexed from, address indexed to);

    constructor(HoneyAccessManager permissions, ParticipantRegistry registry) {
        access = permissions;
        participants = registry;
    }

    function configure(address blend, address custody, address recall) external {
        access.requireRole(access.DEFAULT_ADMIN_ROLE(), msg.sender);
        require(blendRegistry == address(0), "Already configured");
        require(blend.code.length > 0 && custody.code.length > 0 && recall.code.length > 0, "Invalid modules");
        blendRegistry = blend;
        custodyChain = custody;
        recallRegistry = RestrictionRegistry(recall);
    }

    function harvest(bytes32 id, uint128 grams, uint8 product, bytes32 evidenceHash) external {
        participants.requireActiveRole(msg.sender, access.PRODUCER_ROLE());
        _create(id, msg.sender, grams, product, evidenceHash);
    }

    function consume(bytes32 id, uint128 grams, address actor) external {
        require(msg.sender == blendRegistry, "Only blend registry");
        requireUsable(id);
        require(CustodyRegistry(custodyChain).pendingForBatch(id) == bytes32(0), "Pending custody");
        Batch storage batch = batches[id];
        require(batch.custodian == actor && grams > 0 && grams <= batch.available, "Invalid consumption");
        batch.available -= grams;
        emit QuantityConsumed(id, grams, batch.available);
    }

    function createDerived(bytes32 id, address actor, uint128 grams, uint8 product, bytes32 evidenceHash, bytes32[] calldata inputs) external {
        require(msg.sender == blendRegistry, "Only blend registry");
        _create(id, actor, grams, product, evidenceHash);
        for (uint256 i; i < inputs.length; ++i) {
            require(batches[inputs[i]].custodian != address(0), "Unknown parent");
            parents[id].push(inputs[i]);
            _addAncestor(id, inputs[i]);
            bytes32[] storage prior = ancestors[inputs[i]];
            for (uint256 j; j < prior.length; ++j) _addAncestor(id, prior[j]);
        }
    }

    function settleCustody(bytes32 id, address from, address to) external {
        require(msg.sender == custodyChain, "Only custody chain");
        requireUsable(id);
        participants.requireActive(from);
        participants.requireActive(to);
        require(batches[id].custodian == from && batches[id].available > 0, "Custody changed or consumed");
        batches[id].custodian = to;
        emit CustodianChanged(id, from, to);
    }

    function requireUsable(bytes32 id) public view {
        require(!access.paused() && batches[id].custodian != address(0), "Unknown batch or paused");
        require(address(recallRegistry) != address(0) && recallRegistry.effectiveStatus(id) == 0, "Restricted batch");
    }

    function getParents(bytes32 id) external view returns (bytes32[] memory) { return parents[id]; }
    function getAncestors(bytes32 id) external view returns (bytes32[] memory) { return ancestors[id]; }
    function custodianOf(bytes32 id) external view returns (address) { return batches[id].custodian; }

    function _create(bytes32 id, address actor, uint128 grams, uint8 product, bytes32 evidenceHash) private {
        require(id != bytes32(0) && batches[id].custodian == address(0), "Invalid/duplicate batch");
        require(grams > 0 && product > 0 && product <= 2 && evidenceHash != bytes32(0), "Invalid batch");
        batches[id] = Batch(actor, grams, grams, product, evidenceHash);
        emit BatchCreated(id, actor, product, grams, evidenceHash);
    }

    function _addAncestor(bytes32 id, bytes32 ancestor) private {
        bytes32[] storage lineage = ancestors[id];
        for (uint256 i; i < lineage.length; ++i) if (lineage[i] == ancestor) return;
        // ponytail: bounded ancestry keeps recall checks affordable; partition large industrial lots at 128 ancestors.
        require(lineage.length < 128, "Ancestry limit");
        lineage.push(ancestor);
    }
}
