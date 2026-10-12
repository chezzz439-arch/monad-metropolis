# Monad Metropolis Hackathon

Team project for the Monad Metropolis hackathon (Consumer Products & Payments track).

- Submission deadline: October 13, 2026, 11:59 PM ET
- Concept (Chit Circle): [docs/concept.md](docs/concept.md)
- Hackathon brief (bounties, rules, deadlines): [docs/metropolis_hackathon_brief.md](docs/metropolis_hackathon_brief.md)

## Run the App

```sh
npm install
cp .env.example .env
npm start
```

`npm start` opens an Expo Go-compatible tunnel and prints an `exp://` QR code.
Scan it inside Expo Go. Mera passkeys use native modules and do not run in Expo
Go; for those, install a custom development build and run `npm run start:dev`,
which prints a development-client QR instead. `npm run web` starts the separate
browser build.

To inspect live Monad testnet circles, fill in the deployed ChitCircle address
and deployment block in `.env`, then restart Expo. Agora's official deployment
table lists Monad testnet AUSD as
`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`; this address is prefilled in the
examples and can be overridden with `EXPO_PUBLIC_AUSD_ADDRESS`. The AUSD faucet
contract is [`0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`](https://testnet.monadscan.com/address/0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C#code).
The Send screen links to this faucet for test-token claims. Enter a public
account address to inspect circles, or create/unlock a passkey account to submit
transactions. Passkey actions require the domain association and custom native
build described below. With ChitCircle deployment values missing, the app shows
clearly labeled preview data instead.

### Configure Mera Passkeys

Mera passkeys require an HTTPS relying-party hostname your team controls, plus
native app association files. Set `EXPO_PUBLIC_MERA_RP_ID`, the iOS/Android app
IDs, `IOS_TEAM_ID`, and `ANDROID_SHA256_CERT_FINGERPRINTS` in `.env`. Generate
the files with `npm run configure:passkeys`, publish the contents of
`public/.well-known/` at `https://<rp-id>/.well-known/` without redirects, then
run `npm run prebuild` and build/install a custom development client. iOS builds
need Apple signing credentials; the Codespace itself cannot run Xcode.

The app stores only the passkey credential ID and derived public address in
SecureStore. PRF output, seed, and private-key bytes are not persisted. Clearing
the app metadata and signing in with the same discoverable passkey reconstructs
the same account. The prompt-free contribution cap and contract restriction are
client-side policy; Mera's signing key itself does not enforce those limits.

### Deploy ChitCircle to Monad Testnet

The repository does not contain a ChitCircle testnet deployment address yet.
Agora's official [contract deployment table](https://docs.agora.finance/developer/contract-deployments)
lists the Monad testnet AUSD and faucet addresses. The AUSD address is prefilled
in `contracts/.env.example`; verify it is still current before deploying. Do
not substitute the local `MockUSD`.

1. Install Foundry and fund a dedicated deployer account with testnet MON from
	the [Monad faucet](https://faucet.monad.xyz/).
2. Copy `contracts/.env.example` to `contracts/.env`. Confirm `AUSD_ADDRESS`
	matches Agora's Monad testnet entry and fill in `DEPLOYER_PRIVATE_KEY`. Keep
	this file private; never commit or paste the key into chat.
3. From `contracts/`, run:

	```sh
	forge build
	forge test
	forge script script/DeployMonadTestnet.s.sol:DeployMonadTestnet \
	  --rpc-url "$MONAD_TESTNET_RPC_URL" --broadcast
	```

	The script refuses any chain other than Monad testnet and checks that the
	supplied token has contract code and reports 6 decimals. Save the printed
	`CHIT_CIRCLE_ADDRESS` and the deployment transaction hash from Forge output.
4. Get the deployment block from its receipt:

	```sh
	cast receipt <DEPLOYMENT_TX_HASH> --rpc-url "$MONAD_TESTNET_RPC_URL"
	```

	Copy the receipt's `blockNumber`. This is required for efficient circle
	discovery; do not use the block before deployment.
5. Copy `.env.example` at the repository root to `.env` and set
	`EXPO_PUBLIC_CHIT_CIRCLE_ADDRESS` and `EXPO_PUBLIC_DEPLOY_BLOCK` to the
	deployment values. The AUSD address is prefilled; override it only if Agora
	publishes a new Monad testnet token address. Restart Expo and enter the
	public account address whose circles you want to inspect.

This enables the configured testnet app. Passkey transactions work only after
the relying-party domain files are published and the custom development client
is installed; using the Expo Go app will not load the native passkey module.

## Checks

```sh
npm run typecheck
npm run test:sdk
npm run test:sdk:e2e
npm run test:contracts
```

The SDK e2e and contract tests require Foundry (`anvil` and `forge`).

## Implementation Status

- Fixed-order circle contract logic and SDK calls are implemented; local tests
	cover creation, joining, contribution, settlement, default handling, and
	member-to-member transfers.
- The Expo app supports preview mode and configured live Monad testnet reads
	and writes through the SDK.
- Mera passkey account derivation, viem signing, credential metadata storage,
	session expiry, and a client-side contribution scope/cap are implemented.
	The relying-party domain association and native signing build still need
	team-specific identifiers and credentials.
- The official Monad testnet AUSD address is configured; the ChitCircle address
	and deploy block must be supplied through `.env` after deployment.
- Bid mode is a stretch goal and intentionally reverts as unimplemented.
- Transaction activity indexing, invite landing page/universal links, live
	product deployment, tester results, logo, pitch/demo videos, and hackathon
	submission are external or unfinished deliverables.

## Branches

| Branch | Owner |
|---|---|
| `main` | Shared, merge via pull request |
| `kaushik` | Kaushik |
| `sohan` | Sohan |
| `aadit` | Aadit |
| `rohan` | Rohan |

## License

[MIT](LICENSE)
