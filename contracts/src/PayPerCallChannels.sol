// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PayPerCallChannels
/// @notice x402-style unidirectional payment channels for agent-to-agent
///         pay-per-call settlement. A payer escrows PHRS for a provider, then
///         signs cheap off-chain vouchers (one per call) carrying a *cumulative*
///         amount owed. The provider serves calls instantly (funds are locked)
///         and redeems the latest voucher on-chain whenever it wants — no
///         transaction per call. The payer reclaims any unredeemed remainder
///         after the channel expires.
/// @dev    A voucher is a signature over
///         keccak256(abi.encodePacked(address(this), channelId, cumulativeAmount)).
///         Binding the contract address, channel id, and cumulative amount stops
///         voucher forgery, cross-channel replay, and cross-contract replay; the
///         `withdrawn` high-water mark stops double-claims. The recovered signer
///         must equal the channel payer — this is the core security property.
contract PayPerCallChannels {
    /// @param payer     Funds the channel and signs vouchers.
    /// @param provider  Sole address that can redeem vouchers.
    /// @param deposit   Total PHRS escrowed (grows with topUp).
    /// @param withdrawn Cumulative amount already redeemed by the provider.
    /// @param expiry    After this timestamp the payer may reclaim the remainder.
    /// @param closed    Set once reclaimed; a closed channel is inert.
    struct Channel {
        address payer;
        address provider;
        uint256 deposit;
        uint256 withdrawn;
        uint64 expiry;
        bool closed;
    }

    /// @notice Channel data by id.
    mapping(uint256 => Channel) public channels;
    /// @notice Id of the next channel; also the count of channels opened.
    uint256 public nextChannelId;

    event ChannelOpened(
        uint256 indexed channelId,
        address indexed payer,
        address indexed provider,
        uint256 deposit,
        uint64 expiry
    );
    event ToppedUp(uint256 indexed channelId, uint256 amount, uint256 newDeposit);
    event Redeemed(uint256 indexed channelId, address indexed provider, uint256 cumulativeAmount, uint256 paid);
    event Reclaimed(uint256 indexed channelId, address indexed payer, uint256 amount);

    error ZeroDeposit();
    error ZeroDuration();
    error ZeroProvider();
    error ExpiryOverflow();
    error ChannelDoesNotExist();
    error ChannelClosed();
    error NotPayer();
    error NotProvider();
    error AmountExceedsDeposit();
    error NothingToRedeem();
    error BadVoucher();
    error NotExpired();
    error TransferFailed();

    /// @notice Open a channel and escrow `msg.value` for `provider`.
    /// @param provider Address allowed to redeem vouchers from this channel.
    /// @param duration Seconds until the payer may reclaim the remainder.
    /// @return channelId Id of the new channel.
    function openChannel(address provider, uint64 duration) external payable returns (uint256 channelId) {
        if (msg.value == 0) revert ZeroDeposit();
        if (duration == 0) revert ZeroDuration();
        if (provider == address(0)) revert ZeroProvider();

        uint256 expiry = block.timestamp + duration;
        if (expiry > type(uint64).max) revert ExpiryOverflow();

        channelId = nextChannelId++;
        channels[channelId] = Channel({
            payer: msg.sender,
            provider: provider,
            deposit: msg.value,
            withdrawn: 0,
            expiry: uint64(expiry),
            closed: false
        });

        emit ChannelOpened(channelId, msg.sender, provider, msg.value, uint64(expiry));
    }

    /// @notice Add more escrow to an open channel (payer only).
    function topUp(uint256 channelId) external payable {
        Channel storage c = _live(channelId);
        if (msg.sender != c.payer) revert NotPayer();
        if (msg.value == 0) revert ZeroDeposit();

        c.deposit += msg.value;
        emit ToppedUp(channelId, msg.value, c.deposit);
    }

    /// @notice Redeem a voucher (provider only), paying out the newly-owed amount.
    /// @dev Pays `cumulativeAmount - withdrawn` and advances the high-water mark.
    ///      Reverts unless the signature recovers the channel payer.
    /// @param channelId        Target channel.
    /// @param cumulativeAmount Total owed to the provider so far (monotonic).
    /// @param signature        Payer's signature over the voucher hash.
    function redeem(uint256 channelId, uint256 cumulativeAmount, bytes calldata signature) external {
        Channel storage c = _live(channelId);
        if (msg.sender != c.provider) revert NotProvider();
        if (cumulativeAmount > c.deposit) revert AmountExceedsDeposit();
        if (cumulativeAmount <= c.withdrawn) revert NothingToRedeem();
        if (_recoverVoucherSigner(channelId, cumulativeAmount, signature) != c.payer) revert BadVoucher();

        uint256 pay = cumulativeAmount - c.withdrawn;
        c.withdrawn = cumulativeAmount;
        emit Redeemed(channelId, c.provider, cumulativeAmount, pay);

        (bool ok, ) = c.provider.call{value: pay}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Reclaim the unredeemed remainder after expiry (payer only).
    function reclaim(uint256 channelId) external {
        Channel storage c = _live(channelId);
        if (msg.sender != c.payer) revert NotPayer();
        if (block.timestamp <= c.expiry) revert NotExpired();

        uint256 remainder = c.deposit - c.withdrawn;
        c.closed = true;
        emit Reclaimed(channelId, c.payer, remainder);

        if (remainder > 0) {
            (bool ok, ) = c.payer.call{value: remainder}("");
            if (!ok) revert TransferFailed();
        }
    }

    /// @notice The hash a payer signs to authorize a cumulative payment.
    /// @dev Binds this contract, the channel, and the amount.
    function voucherHash(uint256 channelId, uint256 cumulativeAmount) public view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), channelId, cumulativeAmount));
    }

    /// @notice Full channel struct.
    function getChannel(uint256 channelId) external view returns (Channel memory) {
        return channels[channelId];
    }

    /// @notice Amount the provider could still redeem (deposit - withdrawn).
    function redeemable(uint256 channelId) external view returns (uint256) {
        Channel memory c = channels[channelId];
        return c.deposit - c.withdrawn;
    }

    /// @dev Load a channel that exists and is not closed.
    function _live(uint256 channelId) internal view returns (Channel storage c) {
        if (channelId >= nextChannelId) revert ChannelDoesNotExist();
        c = channels[channelId];
        if (c.closed) revert ChannelClosed();
    }

    /// @dev Recover the signer of a voucher over the EIP-191 personal_sign digest,
    ///      so an off-chain `wallet.signMessage(getBytes(voucherHash))` matches.
    ///      ecrecover returns address(0) on a malformed signature, which then
    ///      fails the payer check in `redeem`.
    function _recoverVoucherSigner(uint256 channelId, uint256 cumulativeAmount, bytes calldata signature)
        internal
        view
        returns (address)
    {
        if (signature.length != 65) revert BadVoucher();

        bytes32 digest = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", voucherHash(channelId, cumulativeAmount))
        );

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        return ecrecover(digest, v, r, s);
    }
}
