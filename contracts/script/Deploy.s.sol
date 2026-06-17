// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PayPerCallChannels} from "../src/PayPerCallChannels.sol";

/// @notice Deploys PayPerCallChannels to Pharos Atlantic Testnet.
/// @dev Reads PRIVATE_KEY from env. Run with:
///      forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --legacy
contract Deploy is Script {
    function run() external returns (PayPerCallChannels channels) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        channels = new PayPerCallChannels();
        vm.stopBroadcast();
        console.log("PayPerCallChannels deployed at:", address(channels));
    }
}
