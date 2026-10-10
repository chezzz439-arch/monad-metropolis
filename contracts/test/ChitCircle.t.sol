// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChitCircle} from "../src/ChitCircle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/// @dev Stand-in for AUSD until the testnet token address is confirmed.
contract MockERC20 is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function decimals() external pure returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ChitCircleTest is Test {
    ChitCircle internal chit;
    MockERC20 internal ausd;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal cara = address(0xCA2A);

    uint256 internal constant CONTRIBUTION = 100e6; // $100 at 6 decimals
    uint64 internal constant ROUND = 120; // demo-speed rounds

    function setUp() public {
        chit = new ChitCircle();
        ausd = new MockERC20();

        address[3] memory who = [alice, bob, cara];
        for (uint256 i = 0; i < who.length; ++i) {
            ausd.mint(who[i], 1_000e6);
            vm.prank(who[i]);
            ausd.approve(address(chit), type(uint256).max);
        }
    }

    function _newCircle() internal returns (uint256 id) {
        uint8[] memory order = new uint8[](3);
        order[0] = 0;
        order[1] = 1;
        order[2] = 2;
        id = chit.createCircle(address(ausd), CONTRIBUTION, 3, ROUND, ChitCircle.Mode.Fixed, order);
    }

    function _fill(uint256 id) internal {
        vm.prank(alice);
        chit.join(id);
        vm.prank(bob);
        chit.join(id);
        vm.prank(cara);
        chit.join(id);
    }

    function test_fillingCircleStartsIt() public {
        uint256 id = _newCircle();
        _fill(id);

        ChitCircle.Circle memory c = chit.getCircle(id);
        assertTrue(c.started, "should start when last slot fills");
        assertEq(c.roundDeadline, uint64(block.timestamp) + ROUND);
        // Three deposits are held.
        assertEq(ausd.balanceOf(address(chit)), 3 * CONTRIBUTION);
    }

    function test_everyonePays_recipientGetsWholePot() public {
        uint256 id = _newCircle();
        _fill(id);

        vm.prank(alice);
        chit.contribute(id);
        vm.prank(bob);
        chit.contribute(id);
        vm.prank(cara);
        chit.contribute(id);

        uint256 before = ausd.balanceOf(alice);
        vm.warp(block.timestamp + ROUND);
        chit.settleRound(id); // anyone may call

        assertEq(ausd.balanceOf(alice) - before, 3 * CONTRIBUTION, "round 1 pot to slot 0");
        assertEq(chit.getCircle(id).round, 1);
    }

    function test_missedPayment_seizesDepositAndKeepsPotWhole() public {
        uint256 id = _newCircle();
        _fill(id);

        // Cara does not pay.
        vm.prank(alice);
        chit.contribute(id);
        vm.prank(bob);
        chit.contribute(id);

        uint256 before = ausd.balanceOf(alice);
        vm.warp(block.timestamp + ROUND);
        chit.settleRound(id);

        assertEq(ausd.balanceOf(alice) - before, 3 * CONTRIBUTION, "deposit fills the pot");
        assertTrue(chit.defaulted(id, cara), "cara marked defaulted");
        assertEq(chit.depositOf(id, cara), 0, "deposit seized");
    }

    function test_defaulterCannotWithdrawDeposit() public {
        uint256 id = _newCircle();
        _fill(id);

        // Run all three rounds with cara never paying.
        for (uint8 r = 0; r < 3; ++r) {
            vm.prank(alice);
            chit.contribute(id);
            vm.prank(bob);
            chit.contribute(id);
            vm.warp(block.timestamp + ROUND);
            chit.settleRound(id);
        }

        assertTrue(chit.getCircle(id).finished);

        vm.prank(alice);
        chit.withdrawDeposit(id);
        assertEq(chit.depositOf(id, alice), 0);

        vm.prank(cara);
        vm.expectRevert(ChitCircle.HasDefaulted.selector);
        chit.withdrawDeposit(id);
    }

    function test_cannotSettleBeforeDeadline() public {
        uint256 id = _newCircle();
        _fill(id);

        vm.expectRevert(ChitCircle.RoundStillOpen.selector);
        chit.settleRound(id);
    }

    function test_bidModeNotImplementedYet() public {
        uint256 id = _newCircle();
        vm.expectRevert(ChitCircle.NotImplemented.selector);
        chit.commitBid(id, bytes32(0));
    }
}
