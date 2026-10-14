// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChitCircle} from "../src/ChitCircle.sol";
import {MockERC20} from "./ChitCircle.t.sol";

/// Does defaulting actually cost anything?
///
/// The pitch is "miss a payment and your deposit fills the gap". That is true
/// for the round you miss. These tests ask the next question: across a whole
/// circle, is a defaulter worse off than an honest member?
///
/// They are written to FAIL LOUDLY if the answer changes, in either direction.
/// Nothing here is a bug report about the deposit seizure itself — that works,
/// and is verified on testnet. This is about what happens afterwards.
contract DefaultEconomicsTest is Test {
    ChitCircle internal chit;
    MockERC20 internal ausd;

    address internal alice = address(0xA11CE); // slot 0, paid in full
    address internal bob = address(0xB0B); // slot 1, paid in full
    address internal cara = address(0xCA2A); // slot 2, defaults immediately

    uint256 internal constant CONTRIBUTION = 100e6;
    uint256 internal constant START = 1_000e6;
    uint64 internal constant ROUND = 120;

    function setUp() public {
        chit = new ChitCircle();
        ausd = new MockERC20();
        address[3] memory who = [alice, bob, cara];
        for (uint256 i = 0; i < who.length; ++i) {
            ausd.mint(who[i], START);
            vm.prank(who[i]);
            ausd.approve(address(chit), type(uint256).max);
        }
    }

    /// Three members, fixed order [0,1,2]. Cara never pays a contribution.
    function _runCircleWhereCaraNeverPays() internal returns (uint256 id) {
        uint8[] memory order = new uint8[](3);
        order[0] = 0;
        order[1] = 1;
        order[2] = 2;
        id = chit.createCircle(address(ausd), CONTRIBUTION, 3, ROUND, ChitCircle.Mode.Fixed, order);

        vm.prank(alice);
        chit.join(id);
        vm.prank(bob);
        chit.join(id);
        vm.prank(cara);
        chit.join(id);

        for (uint256 round = 0; round < 3; ++round) {
            vm.prank(alice);
            chit.contribute(id);
            vm.prank(bob);
            chit.contribute(id);
            // Cara pays nothing. After round 0 she *cannot*: contribute()
            // reverts HasDefaulted, so this is forced, not a choice.
            vm.warp(block.timestamp + ROUND);
            chit.settleRound(id);
        }
    }

    function test_oneDefaultIsLockedOutOfPayingForever() public {
        uint256 id = _runCircleWhereCaraNeverPays();
        assertTrue(chit.defaulted(id, cara), "cara is marked defaulted");
        assertEq(chit.depositOf(id, cara), 0, "her deposit was seized");
        // She cannot make herself whole even if she wants to.
        vm.warp(block.timestamp + 1);
        vm.prank(cara);
        vm.expectRevert(ChitCircle.AlreadyFinished.selector);
        chit.contribute(id);
    }

    /// The finding: a defaulter still receives her scheduled payout, so across
    /// the full circle she comes out AHEAD, and an honest member pays for it.
    function test_defaultingIsProfitable_knownLimitation() public {
        uint256 id = _runCircleWhereCaraNeverPays();

        vm.prank(alice);
        chit.withdrawDeposit(id);
        vm.prank(bob);
        chit.withdrawDeposit(id);

        uint256 caraEnd = ausd.balanceOf(cara);
        uint256 bobEnd = ausd.balanceOf(bob);

        // Cara put in one deposit ($100) and nothing else, and was still paid
        // the round-2 pot ($200) because settleRound picks the recipient purely
        // by payout order, with no check on `defaulted`.
        assertGt(caraEnd, START, "defaulter ends up richer than she started");
        assertEq(caraEnd, START + 100e6, "+$100 for never paying a contribution");

        // That gain is not created from nothing — it comes out of the member
        // whose payout round had a smaller pot.
        assertLt(bobEnd, START, "an honest member absorbs the loss");
        assertEq(bobEnd, START - 100e6, "-$100 for paying in full");

        // Alice is whole only because her round-0 pot was topped up by the very
        // deposit that was seized from Cara.
        assertEq(ausd.balanceOf(alice), START, "early slot is unharmed");
    }

    /// No value is minted or burned — this is a redistribution, not a leak.
    /// Worth pinning so a future fix cannot accidentally break conservation.
    function test_totalValueIsConserved() public {
        uint256 id = _runCircleWhereCaraNeverPays();
        vm.prank(alice);
        chit.withdrawDeposit(id);
        vm.prank(bob);
        chit.withdrawDeposit(id);

        uint256 total = ausd.balanceOf(alice) + ausd.balanceOf(bob) + ausd.balanceOf(cara);
        assertEq(total, START * 3, "members' combined balance is unchanged");
        assertEq(ausd.balanceOf(address(chit)), 0, "contract holds nothing at the end");
    }

    /// In the two-member demo circle the hole is invisible: the deposit exactly
    /// covers the one missed contribution, so the defaulter nets zero. This is
    /// why the testnet run looked clean — and why it must not be read as proof
    /// that defaulting is punished.
    function test_twoMemberCircleHidesTheProblem() public {
        uint8[] memory order = new uint8[](2);
        order[0] = 0;
        order[1] = 1;
        uint256 id = chit.createCircle(address(ausd), CONTRIBUTION, 2, ROUND, ChitCircle.Mode.Fixed, order);

        vm.prank(alice);
        chit.join(id);
        vm.prank(bob);
        chit.join(id);

        for (uint256 round = 0; round < 2; ++round) {
            vm.prank(alice);
            chit.contribute(id);
            vm.warp(block.timestamp + ROUND);
            chit.settleRound(id);
        }

        vm.prank(alice);
        chit.withdrawDeposit(id);

        assertEq(ausd.balanceOf(bob), START, "defaulter breaks even, looks punished enough");
        assertEq(ausd.balanceOf(alice), START, "payer breaks even too");
    }
}
