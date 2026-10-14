// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChitCircle} from "../src/ChitCircle.sol";
import {MockUSD} from "../src/mocks/MockUSD.sol";

/**
 * @title DeployLocal
 * @notice Stands up ChitCircle + MockUSD on a local anvil and funds the first
 *         four anvil accounts, so the SDK's end-to-end test has a real chain to
 *         talk to without waiting on a testnet deploy.
 *
 * @dev Refuses to run anywhere but chain 31337 — MockUSD lets anyone mint, so
 *      this must never reach a public network. The testnet deploy is a separate
 *      script (`Deploy.s.sol`) that takes the real AUSD address as input.
 *
 * Usage:
 *   forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8599 --broadcast
 *
 * Prints `CHIT=`, `TOKEN=` lines that the e2e test parses out of stdout.
 */
contract DeployLocal is Script {
    /// Anvil's deterministic test accounts. Public knowledge, not secrets.
    address internal constant A0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address internal constant A1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address internal constant A2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address internal constant A3 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    function run() external {
        require(block.chainid == 31337, "DeployLocal: local chains only");

        vm.startBroadcast();

        ChitCircle chit = new ChitCircle();
        MockUSD token = new MockUSD();

        address[4] memory funded = [A0, A1, A2, A3];
        for (uint256 i = 0; i < funded.length; ++i) {
            token.mint(funded[i], 10_000e6);
        }

        vm.stopBroadcast();

        console2.log("CHIT=%s", address(chit));
        console2.log("TOKEN=%s", address(token));
    }
}
