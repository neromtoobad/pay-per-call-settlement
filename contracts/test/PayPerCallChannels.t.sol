// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayPerCallChannels} from "../src/PayPerCallChannels.sol";

contract PayPerCallChannelsTest is Test {
    PayPerCallChannels internal ppc;

    uint256 internal payerPk = 0xA11CE;
    uint256 internal attackerPk = 0xBAD;
    address internal payer;
    address internal provider = address(0xB0B);

    function setUp() public {
        ppc = new PayPerCallChannels();
        payer = vm.addr(payerPk);
        vm.deal(payer, 10 ether);
    }

    // --- helpers ---------------------------------------------------------------

    /// @dev Build a voucher signature exactly as the contract expects:
    ///      personal_sign over keccak256(abi.encodePacked(contractAddr, channelId, cumulative)).
    function _voucher(uint256 pk, address contractAddr, uint256 channelId, uint256 cumulative)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 h = keccak256(abi.encodePacked(contractAddr, channelId, cumulative));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _open(uint256 value) internal returns (uint256 id) {
        vm.prank(payer);
        id = ppc.openChannel{value: value}(provider, 1 days);
    }

    // --- happy path ------------------------------------------------------------

    function test_HappyPath_OpenRedeemReclaim() public {
        uint256 id = _open(1 ether);

        // First voucher: cumulative 0.3 -> provider receives 0.3.
        uint256 provStart = provider.balance;
        vm.prank(provider);
        ppc.redeem(id, 0.3 ether, _voucher(payerPk, address(ppc), id, 0.3 ether));
        assertEq(provider.balance - provStart, 0.3 ether);

        // Second voucher supersedes: cumulative 0.5 -> provider receives only the +0.2.
        vm.prank(provider);
        ppc.redeem(id, 0.5 ether, _voucher(payerPk, address(ppc), id, 0.5 ether));
        assertEq(provider.balance - provStart, 0.5 ether);
        assertEq(ppc.getChannel(id).withdrawn, 0.5 ether);

        // After expiry the payer reclaims the unredeemed remainder (1.0 - 0.5).
        uint64 expiry = ppc.getChannel(id).expiry;
        vm.warp(expiry + 1);
        uint256 payerStart = payer.balance;
        vm.prank(payer);
        ppc.reclaim(id);
        assertEq(payer.balance - payerStart, 0.5 ether);
        assertTrue(ppc.getChannel(id).closed);
    }

    function test_TopUp_RaisesRedeemCeiling() public {
        uint256 id = _open(0.5 ether);
        vm.prank(payer);
        ppc.topUp{value: 0.5 ether}(id);
        assertEq(ppc.getChannel(id).deposit, 1 ether);

        uint256 provStart = provider.balance;
        vm.prank(provider);
        ppc.redeem(id, 0.8 ether, _voucher(payerPk, address(ppc), id, 0.8 ether));
        assertEq(provider.balance - provStart, 0.8 ether);
    }

    // --- signature security (headline) -----------------------------------------

    function test_RevertWhen_ForgedVoucher() public {
        uint256 id = _open(1 ether);
        bytes memory forged = _voucher(attackerPk, address(ppc), id, 0.3 ether); // not signed by payer
        vm.prank(provider);
        vm.expectRevert(PayPerCallChannels.BadVoucher.selector);
        ppc.redeem(id, 0.3 ether, forged);
    }

    function test_RevertWhen_VoucherFromAnotherChannel() public {
        uint256 id0 = _open(1 ether);
        uint256 id1 = _open(1 ether);
        bytes memory vFor0 = _voucher(payerPk, address(ppc), id0, 0.3 ether);
        vm.prank(provider);
        vm.expectRevert(PayPerCallChannels.BadVoucher.selector);
        ppc.redeem(id1, 0.3 ether, vFor0); // valid amount, wrong channel binding
    }

    function test_RevertWhen_VoucherFromAnotherContract() public {
        uint256 id = _open(1 ether);
        PayPerCallChannels other = new PayPerCallChannels();
        bytes memory vForOther = _voucher(payerPk, address(other), id, 0.3 ether);
        vm.prank(provider);
        vm.expectRevert(PayPerCallChannels.BadVoucher.selector);
        ppc.redeem(id, 0.3 ether, vForOther); // voucher bound to a different contract
    }

    // --- accounting / access ---------------------------------------------------

    function test_RevertWhen_AmountExceedsDeposit() public {
        uint256 id = _open(1 ether);
        vm.prank(provider);
        vm.expectRevert(PayPerCallChannels.AmountExceedsDeposit.selector);
        ppc.redeem(id, 2 ether, _voucher(payerPk, address(ppc), id, 2 ether));
    }

    function test_RevertWhen_AmountNotAboveWithdrawn() public {
        uint256 id = _open(1 ether);
        vm.prank(provider);
        ppc.redeem(id, 0.5 ether, _voucher(payerPk, address(ppc), id, 0.5 ether));
        // Re-submitting the same (or lower) cumulative pays nothing -> revert.
        vm.prank(provider);
        vm.expectRevert(PayPerCallChannels.NothingToRedeem.selector);
        ppc.redeem(id, 0.5 ether, _voucher(payerPk, address(ppc), id, 0.5 ether));
    }

    function test_RevertWhen_NonProviderRedeems() public {
        uint256 id = _open(1 ether);
        bytes memory v = _voucher(payerPk, address(ppc), id, 0.3 ether);
        vm.prank(address(0xDEAD));
        vm.expectRevert(PayPerCallChannels.NotProvider.selector);
        ppc.redeem(id, 0.3 ether, v);
    }

    function test_RevertWhen_ChannelDoesNotExist() public {
        vm.prank(provider);
        vm.expectRevert(PayPerCallChannels.ChannelDoesNotExist.selector);
        ppc.redeem(999, 0.1 ether, _voucher(payerPk, address(ppc), 999, 0.1 ether));
    }

    function test_RevertWhen_ReclaimBeforeExpiry() public {
        uint256 id = _open(1 ether);
        vm.prank(payer);
        vm.expectRevert(PayPerCallChannels.NotExpired.selector);
        ppc.reclaim(id);
    }

    function test_RevertWhen_NonPayerReclaims() public {
        uint256 id = _open(1 ether);
        vm.warp(ppc.getChannel(id).expiry + 1);
        vm.prank(provider);
        vm.expectRevert(PayPerCallChannels.NotPayer.selector);
        ppc.reclaim(id);
    }

    function test_RevertWhen_RedeemAfterClosed() public {
        uint256 id = _open(1 ether);
        vm.warp(ppc.getChannel(id).expiry + 1);
        vm.prank(payer);
        ppc.reclaim(id);

        bytes memory v = _voucher(payerPk, address(ppc), id, 0.3 ether);
        vm.prank(provider);
        vm.expectRevert(PayPerCallChannels.ChannelClosed.selector);
        ppc.redeem(id, 0.3 ether, v);
    }
}
