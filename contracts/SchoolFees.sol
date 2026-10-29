// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Collects native ETH fees. Use only opaque, non-personal student references.
/// @dev A receipt is unique to a student reference and fee, regardless of payer wallet.
contract SchoolFees {
    struct Fee {
        uint256 amountWei;
        bool active;
    }

    struct Receipt {
        address payer;
        uint256 amountWei;
        uint256 paidAt;
        bytes32 studentRef;
        bytes32 feeId;
    }

    address public immutable owner;
    address public immutable treasury;

    mapping(bytes32 => Fee) public fees;
    mapping(bytes32 => Receipt) public receipts;

    uint256 private locked = 1;

    error Unauthorized();
    error InvalidTreasury();
    error InvalidStudentRef();
    error InactiveFee();
    error IncorrectAmount(uint256 expected, uint256 received);
    error AlreadyPaid(bytes32 receiptId);
    error ReentrantCall();
    error WithdrawalFailed();

    event FeeUpdated(bytes32 indexed feeId, uint256 amountWei, bool active);
    event FeePaid(
        bytes32 indexed receiptId,
        bytes32 indexed feeId,
        bytes32 indexed studentRef,
        address payer,
        uint256 amountWei
    );
    event Withdrawn(address indexed treasury, uint256 amountWei);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) revert ReentrantCall();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address treasuryAddress) {
        if (treasuryAddress == address(0)) revert InvalidTreasury();
        owner = msg.sender;
        treasury = treasuryAddress;
    }

    function setFee(bytes32 id, uint256 amountWei, bool active) external onlyOwner {
        fees[id] = Fee({amountWei: amountWei, active: active});
        emit FeeUpdated(id, amountWei, active);
    }

    function getReceiptId(bytes32 studentRef, bytes32 feeId) public pure returns (bytes32) {
        return keccak256(abi.encode(studentRef, feeId));
    }

    /// @param studentRef An opaque random reference, never a name, email, or student number.
    function payFee(bytes32 feeId, bytes32 studentRef) external payable nonReentrant {
        if (studentRef == bytes32(0)) revert InvalidStudentRef();

        Fee memory fee = fees[feeId];
        if (!fee.active) revert InactiveFee();
        if (msg.value != fee.amountWei) revert IncorrectAmount(fee.amountWei, msg.value);

        bytes32 receiptId = getReceiptId(studentRef, feeId);
        if (receipts[receiptId].payer != address(0)) revert AlreadyPaid(receiptId);

        receipts[receiptId] = Receipt({
            payer: msg.sender,
            amountWei: msg.value,
            paidAt: block.timestamp,
            studentRef: studentRef,
            feeId: feeId
        });

        emit FeePaid(receiptId, feeId, studentRef, msg.sender, msg.value);
    }

    /// @notice The owner can forward the entire collected balance only to the fixed treasury.
    function withdraw() external onlyOwner nonReentrant {
        uint256 amountWei = address(this).balance;
        (bool success, ) = payable(treasury).call{value: amountWei}("");
        if (!success) revert WithdrawalFailed();
        emit Withdrawn(treasury, amountWei);
    }
}
