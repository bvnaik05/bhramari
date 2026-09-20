// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {HoneyAccessManager} from "../src/HoneyAccessManager.sol";
import {ParticipantRegistry} from "../src/ParticipantRegistry.sol";
import {BatchRegistry} from "../src/BatchRegistry.sol";
import {CustodyChain} from "../src/CustodyChain.sol";
import {BlendRegistry} from "../src/BlendRegistry.sol";
import {EvidenceAnchor} from "../src/EvidenceAnchor.sol";
import {RecallRegistry} from "../src/RecallRegistry.sol";

interface Vm {
    function prank(address actor) external;
    function expectRevert() external;
    function warp(uint256 timestamp) external;
}

contract BhramariTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    HoneyAccessManager access;
    ParticipantRegistry participants;
    BatchRegistry batches;
    CustodyChain custody;
    BlendRegistry blend;
    EvidenceAnchor evidence;
    RecallRegistry recall;
    address constant FARMER = address(0x100);
    address constant PACKER = address(0x200);
    bytes32 constant SOURCE = keccak256("source");
    bytes32 constant CHILD = keccak256("child");
    bytes32 constant DIGEST = keccak256("encrypted evidence");

    function setUp() public {
        vm.warp(1_800_000_000);
        access = new HoneyAccessManager(address(this), 2 days);
        participants = new ParticipantRegistry(access);
        batches = new BatchRegistry(access, participants);
        custody = new CustodyChain(batches);
        blend = new BlendRegistry(batches);
        evidence = new EvidenceAnchor(access, participants);
        recall = new RecallRegistry(batches);
        batches.configure(address(blend), address(custody), address(recall));
        access.grantRole(access.REGISTRAR_ROLE(), address(this));
        access.grantRole(access.RECALL_ROLE(), address(this));
        access.grantRole(access.ANCHOR_ROLE(), address(this));
        access.grantRole(access.PRODUCER_ROLE(), FARMER);
        access.grantRole(access.OPERATOR_ROLE(), FARMER);
        access.grantRole(access.OPERATOR_ROLE(), PACKER);
        participants.register(FARMER, keccak256("org1"), DIGEST);
        participants.register(PACKER, keccak256("org2"), DIGEST);
        vm.prank(FARMER);
        batches.harvest(SOURCE, 18000, 1, DIGEST);
    }

    function testTwoPartyCustodyAndRevocation() public {
        vm.prank(FARMER);
        custody.propose(DIGEST, SOURCE, PACKER, uint64(block.timestamp + 1 days), DIGEST);
        require(batches.custodianOf(SOURCE) == FARMER);
        vm.expectRevert();
        vm.prank(FARMER);
        custody.accept(DIGEST, DIGEST);
        vm.prank(PACKER);
        custody.accept(DIGEST, DIGEST);
        require(batches.custodianOf(SOURCE) == PACKER);
        participants.setActive(PACKER, false, DIGEST);
        vm.expectRevert();
        vm.prank(PACKER);
        custody.propose(CHILD, SOURCE, FARMER, uint64(block.timestamp + 1 days), DIGEST);
    }

    function testDescendantRecallAndImmutableCheckpoint() public {
        _split(9000, 9000);
        recall.setStatus(SOURCE, 2, DIGEST);
        require(recall.effectiveStatus(CHILD) == 2);
        vm.expectRevert();
        recall.setStatus(SOURCE, 0, DIGEST);
        vm.expectRevert();
        vm.prank(FARMER);
        custody.propose(DIGEST, CHILD, PACKER, uint64(block.timestamp + 1 days), DIGEST);
        evidence.anchorCheckpoint(DIGEST, CHILD, 1);
        require(evidence.verifyInclusion(DIGEST, CHILD, new bytes32[](0)));
        vm.expectRevert();
        evidence.anchorCheckpoint(DIGEST, SOURCE, 1);
    }

    function testHashProofRejectsMutation() public {
        bytes32 left = sha256("event-a");
        bytes32 right = sha256("event-b");
        bytes32 root = left < right ? sha256(abi.encodePacked(left, right)) : sha256(abi.encodePacked(right, left));
        evidence.anchorCheckpoint(DIGEST, root, 2);
        bytes32[] memory siblings = new bytes32[](1);
        siblings[0] = right;
        require(evidence.verifyInclusion(DIGEST, left, siblings));
        require(!evidence.verifyInclusion(DIGEST, sha256("changed event"), siblings));
    }

    function testFuzzQuantityConservation(uint128 requested, uint128 extra) public {
        uint128 amount = uint128(uint256(requested) % 18000 + 1);
        _split(amount, amount);
        (, uint128 quantity, uint128 available,,) = batches.batches(SOURCE);
        require(quantity == 18000 && available + amount == quantity);
        uint128 overdraw = uint128(uint256(extra) % 18000 + 18001);
        vm.expectRevert();
        _split(overdraw, overdraw);
        (,, uint128 afterFailure,,) = batches.batches(SOURCE);
        require(afterFailure == available);
    }

    function testFuzzCannotCreateMass(uint128 excess) public {
        uint128 output = uint128(uint256(excess) % 1000000 + 18001);
        vm.expectRevert();
        _split(18000, output);
        (,, uint128 available,,) = batches.batches(SOURCE);
        require(available == 18000 && batches.custodianOf(CHILD) == address(0));
    }

    function testRolesPauseAndEvidenceRevocation() public {
        vm.expectRevert();
        batches.harvest(CHILD, 500, 1, DIGEST);
        access.pause();
        vm.expectRevert();
        vm.prank(FARMER);
        batches.harvest(CHILD, 500, 1, DIGEST);
        access.unpause();
        access.grantRole(access.LAB_ROLE(), PACKER);
        vm.prank(PACKER);
        evidence.recordEvidence(CHILD, SOURCE, DIGEST, uint64(block.timestamp + 1 days));
        recall.setStatus(SOURCE, 1, DIGEST);
        recall.setStatus(SOURCE, 0, DIGEST);
        evidence.revokeEvidence(CHILD, DIGEST);
        require(evidence.revoked(CHILD));
    }

    function _split(uint128 input, uint128 output) private {
        bytes32[] memory inputs = new bytes32[](1);
        inputs[0] = SOURCE;
        uint128[] memory amounts = new uint128[](1);
        amounts[0] = input;
        BlendRegistry.Output[] memory outputs = new BlendRegistry.Output[](1);
        outputs[0] = BlendRegistry.Output(CHILD, output, 1);
        vm.prank(FARMER);
        blend.transform(keccak256(abi.encode(input, output)), inputs, amounts, outputs, 0, DIGEST);
    }
}

contract QuantityHandler {
    BatchRegistry public immutable batches;
    BlendRegistry public immutable blend;
    bytes32 public immutable source;
    uint256 public issued;
    uint256 public counter;

    constructor(BatchRegistry registry, BlendRegistry transformer, bytes32 root) {
        batches = registry; blend = transformer; source = root;
    }

    function split(uint128 requested) external {
        (,,uint128 available,,) = batches.batches(source);
        if (available == 0) return;
        uint128 amount = uint128(uint256(requested) % available + 1);
        bytes32 child = keccak256(abi.encode(++counter));
        bytes32[] memory inputs = new bytes32[](1); inputs[0] = source;
        uint128[] memory amounts = new uint128[](1); amounts[0] = amount;
        BlendRegistry.Output[] memory outputs = new BlendRegistry.Output[](1);
        outputs[0] = BlendRegistry.Output(child, amount, 1);
        blend.transform(child, inputs, amounts, outputs, 0, source);
        issued += amount;
    }
}

contract ConservationInvariantTest {
    BatchRegistry batches;
    QuantityHandler handler;
    bytes32 constant SOURCE = keccak256("invariant-source");

    function setUp() public {
        HoneyAccessManager access = new HoneyAccessManager(address(this), 2 days);
        ParticipantRegistry participants = new ParticipantRegistry(access);
        batches = new BatchRegistry(access, participants);
        BlendRegistry blend = new BlendRegistry(batches);
        CustodyChain custody = new CustodyChain(batches);
        RecallRegistry recall = new RecallRegistry(batches);
        batches.configure(address(blend), address(custody), address(recall));
        handler = new QuantityHandler(batches, blend, SOURCE);
        access.grantRole(access.REGISTRAR_ROLE(), address(this));
        access.grantRole(access.PRODUCER_ROLE(), address(handler));
        access.grantRole(access.OPERATOR_ROLE(), address(handler));
        participants.register(address(handler), SOURCE, SOURCE);
        Vm(address(uint160(uint256(keccak256("hevm cheat code"))))).prank(address(handler));
        batches.harvest(SOURCE, 1000000, 1, SOURCE);
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1); targets[0] = address(handler);
    }

    function invariantSourceConservation() public view {
        (,,uint128 available,,) = batches.batches(SOURCE);
        require(available + handler.issued() == 1000000, "Mass conservation failed");
    }
}
