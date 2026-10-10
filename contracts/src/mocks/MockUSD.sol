// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";

/**
 * @title MockUSD
 * @notice A 6-decimal stand-in for AUSD, for local chains only.
 *
 * @dev This exists so `anvil` can run the whole flow before the real AUSD
 *      address is confirmed. `mint` is unguarded on purpose — anyone can print
 *      themselves money. NEVER deploy this to a public network; the deploy
 *      script that uses it refuses any chain id other than 31337.
 */
contract MockUSD is IERC20 {
    string public constant name = "Mock USD";
    string public constant symbol = "mUSD";

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
