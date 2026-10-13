// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChitCircle} from "../src/ChitCircle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/**
 * @title Deploy
 * @notice Deploys ChitCircle to Monad testnet against Agora's real AUSD.
 *
 * @dev No MockUSD here, ever — that contract lets anyone mint and must not
 *      reach a public network. This script only deploys ChitCircle; the token
 *      is chosen per-circle at `createCircle`, so AUSD is configuration rather
 *      than a constructor argument. It is still checked below, because a typo
 *      in the token address would not surface until the first join fails.
 *
 * Usage:
 *   export MONAD_RPC=https://testnet-rpc.monad.xyz
 *   forge script script/Deploy.s.sol --rpc-url $MONAD_RPC --broadcast \
 *     --interactive --verify --verifier sourcify \
 *     --verifier-url https://sourcify-api-monad.blockvision.org
 *
 * `--interactive` prompts for the deployer key and keeps it out of your shell
 * history and the repo. Never pass --private-key inline.
 *
 * Prints CHIT=, TOKEN= and BLOCK= — copy all three into sdk/src/config.ts.
 */
contract Deploy is Script {
    uint256 internal constant MONAD_TESTNET = 10143;

    /// Agora's AUSD on Monad testnet. Verified on-chain: name "AUSD", 6 decimals.
    address internal constant AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;

    function run() external {
        require(block.chainid == MONAD_TESTNET, "Deploy: Monad testnet only");

        // A wrong token address is silent until someone tries to join, by which
        // point the address is already in the README and three screens.
        address token = vm.envOr("AUSD_ADDRESS", AUSD);
        require(token.code.length > 0, "Deploy: AUSD address has no code");
        require(IERC20(token).decimals() == 6, "Deploy: AUSD should have 6 decimals");

        vm.startBroadcast();
        ChitCircle chit = new ChitCircle();
        vm.stopBroadcast();

        console2.log("CHIT=%s", address(chit));
        console2.log("TOKEN=%s", token);
        console2.log("BLOCK=%s", block.number);
    }
}
