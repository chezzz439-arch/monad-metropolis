import { isAddress, type Address } from "viem";
import {
  MONAD_TESTNET_AUSD_ADDRESS,
  MONAD_TESTNET_CHAIN_ID,
  type Deployment,
} from "../../sdk/src/config";

declare const process: {
  env: {
    EXPO_PUBLIC_MONAD_RPC_URL?: string;
    EXPO_PUBLIC_CHIT_CIRCLE_ADDRESS?: string;
    EXPO_PUBLIC_AUSD_ADDRESS?: string;
    EXPO_PUBLIC_DEPLOY_BLOCK?: string;
  };
};

const contractAddress = process.env.EXPO_PUBLIC_CHIT_CIRCLE_ADDRESS;
const tokenAddress = process.env.EXPO_PUBLIC_AUSD_ADDRESS || MONAD_TESTNET_AUSD_ADDRESS;
const deployBlock = process.env.EXPO_PUBLIC_DEPLOY_BLOCK;
const rpcUrl = process.env.EXPO_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";

export const configuredDeployment: Deployment | null =
  contractAddress &&
  tokenAddress &&
  deployBlock &&
  /^\d+$/.test(deployBlock) &&
  isAddress(contractAddress) &&
  isAddress(tokenAddress) &&
  rpcUrl.startsWith("https://")
    ? {
        chainId: MONAD_TESTNET_CHAIN_ID,
        rpcUrl,
        chitCircle: contractAddress as Address,
        token: tokenAddress as Address,
        deployBlock: BigInt(deployBlock),
        inviteBaseUrl: "https://chitcircle.app",
      }
    : null;