// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChitCircle} from "../src/ChitCircle.sol";

contract DeployMonadTestnet is Script {
    uint256 internal constant MONAD_TESTNET_CHAIN_ID = 10143;

    function run() external {
        require(block.chainid == MONAD_TESTNET_CHAIN_ID, "Monad testnet only");

        address token = vm.envAddress("AUSD_ADDRESS");
        require(token.code.length > 0, "AUSD_ADDRESS has no contract code");

        (bool decimalsRead, bytes memory result) = token.staticcall(abi.encodeWithSignature("decimals()"));
        require(decimalsRead && result.length >= 32, "AUSD decimals() unavailable");
        require(abi.decode(result, (uint256)) == 6, "AUSD must have 6 decimals");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        ChitCircle chitCircle = new ChitCircle();
        vm.stopBroadcast();

        console2.log("CHAIN_ID", block.chainid);
        console2.log("CHIT_CIRCLE_ADDRESS", address(chitCircle));
        console2.log("AUSD_ADDRESS", token);
    }
}