// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

/// @title ChitCircle
/// @notice Rotating savings circles (chit funds, tandas, susu, paluwagan) where
///         the pot is held by this contract rather than an organizer.
///
/// Each member locks a deposit of one contribution when joining. Every round,
/// members pay one contribution and the whole pot goes to that round's
/// recipient. If a member misses a payment, their deposit is taken to fill the
/// pot and they are marked as defaulted.
///
/// @dev SKELETON. Fixed-order mode is implemented end to end. Bid mode
///      (`commitBid` / `revealBid`) reverts with {NotImplemented} and is the
///      stretch goal for the Mera "One Passkey, Many Keys" bounty.
///
///      Known limit, stated deliberately rather than hidden: a deposit of one
///      contribution covers exactly one missed payment. A member who takes the
///      pot early and then stops paying for several rounds can still leave the
///      group short. {settleRound} pays out whatever the pot holds and emits
///      the shortfall in {RoundSettled} rather than reverting, so a circle can
///      never be bricked by a defaulter. Mitigations under discussion: larger
///      deposits for early slots, and making early slots go by bid.
contract ChitCircle {
    enum Mode {
        Fixed,
        Bid
    }

    struct Circle {
        address token;
        uint256 contribution;
        uint8 maxMembers;
        uint64 roundSeconds;
        Mode mode;
        uint8 round; // 0-based index of the round in progress
        uint64 roundDeadline; // 0 until the circle fills
        uint256 pot; // contributions held for the round in progress
        bool started;
        bool finished;
    }

    uint256 public nextCircleId;

    mapping(uint256 => Circle) private _circles;

    /// @dev Join order. `members[circleId][slot]`, slot assigned on join.
    mapping(uint256 => address[]) private _members;

    /// @dev Slot indices into `_members`, in payout order. Set at creation,
    ///      before members are known, so slots are used rather than addresses.
    mapping(uint256 => uint8[]) private _payoutOrder;

    mapping(uint256 => mapping(address => bool)) public isMember;
    mapping(uint256 => mapping(address => uint256)) public depositOf;
    mapping(uint256 => mapping(address => bool)) public defaulted;
    mapping(uint256 => mapping(address => bool)) public depositWithdrawn;

    /// @dev `hasPaid[circleId][round][member]`
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public hasPaid;

    event CircleCreated(
        uint256 indexed circleId,
        address indexed organizer,
        address token,
        uint256 contribution,
        uint8 maxMembers,
        uint64 roundSeconds,
        Mode mode
    );
    event Joined(uint256 indexed circleId, address indexed member, uint8 slot, uint256 deposit);
    event CircleStarted(uint256 indexed circleId, uint64 firstRoundDeadline);
    event Contributed(uint256 indexed circleId, uint8 indexed round, address indexed member, uint256 amount);
    event Defaulted(uint256 indexed circleId, uint8 indexed round, address indexed member, uint256 depositSeized);
    event RoundSettled(
        uint256 indexed circleId,
        uint8 indexed round,
        address indexed recipient,
        uint256 amount,
        uint256 shortfall
    );
    event DepositWithdrawn(uint256 indexed circleId, address indexed member, uint256 amount);
    event BidCommitted(uint256 indexed circleId, uint8 indexed round, address indexed member, bytes32 commitment);
    event BidRevealed(uint256 indexed circleId, uint8 indexed round, address indexed member, uint256 discount);

    error NotImplemented();
    error BadContribution();
    error BadMemberCount();
    error BadRoundLength();
    error BadPayoutOrder();
    error UnknownCircle();
    error AlreadyStarted();
    error NotStarted();
    error AlreadyFinished();
    error NotFinished();
    error CircleFull();
    error AlreadyMember();
    error NotAMember();
    error AlreadyPaid();
    error HasDefaulted();
    error RoundStillOpen();
    error NothingToWithdraw();
    error WrongMode();
    error TransferFailed();

    // ---------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------

    /// @param payoutOrder Slot indices (0..maxMembers-1) in the order they
    ///        receive the pot. Must be a permutation of every slot exactly once.
    function createCircle(
        address token,
        uint256 contribution,
        uint8 maxMembers,
        uint64 roundSeconds,
        Mode mode,
        uint8[] calldata payoutOrder
    ) external returns (uint256 circleId) {
        if (contribution == 0) revert BadContribution();
        if (maxMembers < 2) revert BadMemberCount();
        if (roundSeconds == 0) revert BadRoundLength();
        if (payoutOrder.length != maxMembers) revert BadPayoutOrder();

        // Reject anything that is not a permutation; a repeated slot would pay
        // one member twice and strand another.
        bool[] memory seen = new bool[](maxMembers);
        for (uint256 i = 0; i < payoutOrder.length; ++i) {
            uint8 slot = payoutOrder[i];
            if (slot >= maxMembers || seen[slot]) revert BadPayoutOrder();
            seen[slot] = true;
        }

        circleId = nextCircleId++;
        _circles[circleId] = Circle({
            token: token,
            contribution: contribution,
            maxMembers: maxMembers,
            roundSeconds: roundSeconds,
            mode: mode,
            round: 0,
            roundDeadline: 0,
            pot: 0,
            started: false,
            finished: false
        });
        _payoutOrder[circleId] = payoutOrder;

        emit CircleCreated(circleId, msg.sender, token, contribution, maxMembers, roundSeconds, mode);
    }

    /// @notice Lock a deposit of one contribution and take the next free slot.
    ///         The circle starts automatically once the last slot is filled.
    function join(uint256 circleId) external {
        Circle storage c = _load(circleId);
        if (c.started) revert AlreadyStarted();
        if (isMember[circleId][msg.sender]) revert AlreadyMember();

        address[] storage members = _members[circleId];
        if (members.length >= c.maxMembers) revert CircleFull();

        uint8 slot = uint8(members.length);
        members.push(msg.sender);
        isMember[circleId][msg.sender] = true;
        depositOf[circleId][msg.sender] = c.contribution;

        _pull(c.token, msg.sender, c.contribution);
        emit Joined(circleId, msg.sender, slot, c.contribution);

        if (members.length == c.maxMembers) {
            c.started = true;
            c.roundDeadline = uint64(block.timestamp) + c.roundSeconds;
            emit CircleStarted(circleId, c.roundDeadline);
        }
    }

    // ---------------------------------------------------------------------
    // Rounds
    // ---------------------------------------------------------------------

    /// @notice Pay this round's contribution into the pot.
    function contribute(uint256 circleId) external {
        Circle storage c = _load(circleId);
        if (!c.started) revert NotStarted();
        if (c.finished) revert AlreadyFinished();
        if (!isMember[circleId][msg.sender]) revert NotAMember();
        if (defaulted[circleId][msg.sender]) revert HasDefaulted();
        if (hasPaid[circleId][c.round][msg.sender]) revert AlreadyPaid();

        hasPaid[circleId][c.round][msg.sender] = true;
        c.pot += c.contribution;

        _pull(c.token, msg.sender, c.contribution);
        emit Contributed(circleId, c.round, msg.sender, c.contribution);
    }

    /// @notice Close the round: seize deposits from anyone who did not pay, send
    ///         the pot to this round's recipient, and advance.
    /// @dev Callable by anyone once the deadline passes — no organizer and no
    ///      backend needed, which is the point.
    function settleRound(uint256 circleId) external {
        Circle storage c = _load(circleId);
        if (!c.started) revert NotStarted();
        if (c.finished) revert AlreadyFinished();
        if (block.timestamp < c.roundDeadline) revert RoundStillOpen();
        // Bid mode must resolve the winning discount before paying out.
        if (c.mode != Mode.Fixed) revert WrongMode();

        uint8 round = c.round;
        address[] storage members = _members[circleId];
        uint256 expected = uint256(c.maxMembers) * c.contribution;

        for (uint256 i = 0; i < members.length; ++i) {
            address m = members[i];
            if (hasPaid[circleId][round][m]) continue;

            uint256 seized = depositOf[circleId][m];
            if (seized != 0) {
                depositOf[circleId][m] = 0;
                c.pot += seized;
            }
            // Already-defaulted members stay defaulted; the event records the
            // repeat miss with a zero seizure so the UI can show it.
            defaulted[circleId][m] = true;
            emit Defaulted(circleId, round, m, seized);
        }

        address recipient = members[_payoutOrder[circleId][round]];
        uint256 amount = c.pot;
        uint256 shortfall = expected > amount ? expected - amount : 0;

        c.pot = 0;
        c.round = round + 1;
        if (c.round == c.maxMembers) {
            c.finished = true;
        } else {
            c.roundDeadline += c.roundSeconds;
        }

        if (amount != 0) _pay(c.token, recipient, amount);
        emit RoundSettled(circleId, round, recipient, amount, shortfall);
    }

    /// @notice Return a member's deposit after the final round.
    function withdrawDeposit(uint256 circleId) external {
        Circle storage c = _load(circleId);
        if (!c.finished) revert NotFinished();
        if (!isMember[circleId][msg.sender]) revert NotAMember();
        if (defaulted[circleId][msg.sender]) revert HasDefaulted();
        if (depositWithdrawn[circleId][msg.sender]) revert NothingToWithdraw();

        uint256 amount = depositOf[circleId][msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        depositWithdrawn[circleId][msg.sender] = true;
        depositOf[circleId][msg.sender] = 0;

        _pay(c.token, msg.sender, amount);
        emit DepositWithdrawn(circleId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Bid mode — stretch goal, not yet implemented
    // ---------------------------------------------------------------------

    /// @notice Submit `keccak256(abi.encode(discount, derivedSecret))`, where
    ///         `derivedSecret` is Mera PRF output for salt
    ///         `chitcircle:bid:<circleId>:<round>`. Nothing is stored
    ///         off-chain; the secret is re-derived from the passkey to reveal.
    /// @dev TODO: store commitment, enforce a bidding window inside the round.
    function commitBid(uint256 circleId, bytes32 commitment) external {
        revert NotImplemented();
    }

    /// @notice Reveal a sealed bid. Highest discount wins the pot minus the
    ///         discount; the discount is split as a dividend among the others.
    /// @dev TODO: verify the commitment, track the best bid, pay the dividend.
    function revealBid(uint256 circleId, uint256 discount, bytes32 secret) external {
        revert NotImplemented();
    }

    // ---------------------------------------------------------------------
    // Views — the surface the app's data layer reads
    // ---------------------------------------------------------------------

    function getCircle(uint256 circleId) external view returns (Circle memory) {
        return _circles[circleId];
    }

    function getMembers(uint256 circleId) external view returns (address[] memory) {
        return _members[circleId];
    }

    function getPayoutOrder(uint256 circleId) external view returns (uint8[] memory) {
        return _payoutOrder[circleId];
    }

    /// @notice Who receives the pot in `round`. Reverts until the circle fills,
    ///         since slots are not bound to addresses before then.
    function recipientOf(uint256 circleId, uint8 round) external view returns (address) {
        Circle storage c = _load(circleId);
        if (!c.started) revert NotStarted();
        return _members[circleId][_payoutOrder[circleId][round]];
    }

    /// @notice Members who still owe the round in progress.
    function outstanding(uint256 circleId) external view returns (address[] memory) {
        Circle storage c = _load(circleId);
        address[] storage members = _members[circleId];

        uint256 n;
        for (uint256 i = 0; i < members.length; ++i) {
            if (!hasPaid[circleId][c.round][members[i]]) ++n;
        }

        address[] memory owed = new address[](n);
        uint256 j;
        for (uint256 i = 0; i < members.length; ++i) {
            if (!hasPaid[circleId][c.round][members[i]]) owed[j++] = members[i];
        }
        return owed;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _load(uint256 circleId) private view returns (Circle storage c) {
        c = _circles[circleId];
        if (c.contribution == 0) revert UnknownCircle();
    }

    function _pull(address token, address from, uint256 amount) private {
        if (!IERC20(token).transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _pay(address token, address to, uint256 amount) private {
        if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
    }
}
