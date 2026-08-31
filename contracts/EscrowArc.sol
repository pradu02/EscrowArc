// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title EscrowArc
/// @notice Testnet-only single-milestone escrow for an ERC-20 token such as Arc test vUSDC.
/// @dev The client can refund only before the freelancer accepts. After acceptance, the client
///      releases payment. Production use needs an audited dispute and timeout design.
contract EscrowArc {
    enum Status { None, Funded, Accepted, Released, Refunded }

    struct Escrow {
        address client;
        address freelancer;
        uint256 amount;
        Status status;
        string description;
    }

    IERC20 public immutable paymentToken;
    uint256 public nextEscrowId = 1;
    uint256 private unlocked = 1;

    mapping(uint256 => Escrow) private escrows;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed client,
        address indexed freelancer,
        uint256 amount,
        string description
    );
    event EscrowAccepted(uint256 indexed escrowId, address indexed freelancer);
    event PaymentReleased(uint256 indexed escrowId, address indexed freelancer, uint256 amount);
    event EscrowRefunded(uint256 indexed escrowId, address indexed client, uint256 amount);

    modifier nonReentrant() {
        require(unlocked == 1, "Reentrant call");
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Token address required");
        paymentToken = IERC20(tokenAddress);
    }

    function createEscrow(
        address freelancer,
        uint256 amount,
        string calldata description
    ) external nonReentrant returns (uint256 escrowId) {
        require(freelancer != address(0), "Freelancer required");
        require(freelancer != msg.sender, "Choose another wallet");
        require(amount > 0, "Amount must be greater than zero");
        require(bytes(description).length <= 280, "Description too long");

        escrowId = nextEscrowId++;
        escrows[escrowId] = Escrow({
            client: msg.sender,
            freelancer: freelancer,
            amount: amount,
            status: Status.Funded,
            description: description
        });

        require(paymentToken.transferFrom(msg.sender, address(this), amount), "Funding transfer failed");
        emit EscrowCreated(escrowId, msg.sender, freelancer, amount, description);
    }

    function acceptEscrow(uint256 escrowId) external {
        Escrow storage escrow = _fundedEscrow(escrowId);
        require(msg.sender == escrow.freelancer, "Only the freelancer can accept");
        escrow.status = Status.Accepted;
        emit EscrowAccepted(escrowId, msg.sender);
    }

    function releasePayment(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.Accepted, "Escrow is not accepted");
        require(msg.sender == escrow.client, "Only the client can release");

        escrow.status = Status.Released;
        require(paymentToken.transfer(escrow.freelancer, escrow.amount), "Payment transfer failed");
        emit PaymentReleased(escrowId, escrow.freelancer, escrow.amount);
    }

    /// @dev Refund is allowed while the escrow is Funded (freelancer hasn't accepted yet)
    ///      OR Accepted (freelancer accepted but the client wants to cancel because work
    ///      never started or was abandoned). Once payment is Released, refund is no longer
    ///      possible, since funds have already left the contract.
    function refundEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(
            escrow.status == Status.Funded || escrow.status == Status.Accepted,
            "Escrow cannot be refunded in its current state"
        );
        require(msg.sender == escrow.client, "Only the client can refund");

        escrow.status = Status.Refunded;
        require(paymentToken.transfer(escrow.client, escrow.amount), "Refund transfer failed");
        emit EscrowRefunded(escrowId, escrow.client, escrow.amount);
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        require(escrows[escrowId].status != Status.None, "Escrow not found");
        return escrows[escrowId];
    }

    function _fundedEscrow(uint256 escrowId) private view returns (Escrow storage escrow) {
        escrow = escrows[escrowId];
        require(escrow.status == Status.Funded, "Escrow is not funded");
    }
}
