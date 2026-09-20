// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BatchRegistry} from "./BatchRegistry.sol";

contract BlendRegistry {
    struct Output { bytes32 id; uint128 grams; uint8 product; }
    BatchRegistry public immutable batches;
    mapping(bytes32 => bool) public operations;
    event Transformation(bytes32 indexed operationId, bytes32[] inputs, bytes32[] outputs, uint256 inputGrams, uint256 lossGrams, bytes32 evidenceHash);

    constructor(BatchRegistry registry) { batches = registry; }

    /// @notice Split, aggregate, or transform. All quantities are integer grams, including documented process loss.
    function transform(bytes32 operationId, bytes32[] calldata inputs, uint128[] calldata amounts, Output[] calldata outputs, uint128 loss, bytes32 evidenceHash) external {
        batches.participants().requireActiveRole(msg.sender, batches.access().OPERATOR_ROLE());
        require(operationId != bytes32(0) && !operations[operationId], "Duplicate operation");
        require(inputs.length > 0 && inputs.length <= 16 && inputs.length == amounts.length, "Invalid inputs");
        require(outputs.length > 0 && outputs.length <= 16, "Invalid outputs");
        uint256 inputTotal = _consume(inputs, amounts);
        (uint256 outputTotal, bytes32[] memory outputIds) = _createOutputs(inputs, outputs, evidenceHash);
        require(inputTotal == outputTotal + loss, "Mass imbalance");
        operations[operationId] = true;
        emit Transformation(operationId, inputs, outputIds, inputTotal, loss, evidenceHash);
    }

    function _consume(bytes32[] calldata inputs, uint128[] calldata amounts) private returns (uint256 inputTotal) {
        for (uint256 i; i < inputs.length; ++i) {
            for (uint256 j; j < i; ++j) require(inputs[i] != inputs[j], "Duplicate input");
            batches.consume(inputs[i], amounts[i], msg.sender);
            inputTotal += amounts[i];
        }
    }

    function _createOutputs(bytes32[] calldata inputs, Output[] calldata outputs, bytes32 evidenceHash) private returns (uint256 outputTotal, bytes32[] memory outputIds) {
        outputIds = new bytes32[](outputs.length);
        for (uint256 i; i < outputs.length; ++i) {
            outputTotal += outputs[i].grams;
            outputIds[i] = outputs[i].id;
            batches.createDerived(outputs[i].id, msg.sender, outputs[i].grams, outputs[i].product, evidenceHash, inputs);
        }
    }
}
