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

### ChitCircle on Monad Testnet

ChitCircle is **already deployed and verified** on Monad testnet, and those
values are baked into `sdk/src/config.ts`, so the app runs with no `.env` at
all:

| | |
|---|---|
| ChitCircle | `0x13ec22E7d0BF5b728549990aA852d03BCC9da73D` |
| AUSD (Agora) | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` (6 decimals) |
| Deploy block | `70523429` |

Source is verified on Sourcify, and the on-chain bytecode was checked against
the local build. The contract has no owner, admin or pause function, so the
deploying account holds no privileges over it. A full lifecycle — create, join,
contribute, settle with deposit seizure, withdraw — has been run against this
live deployment.

The root `.env` is only needed to **override** these (a redeploy) or to set
`EXPO_PUBLIC_MERA_RP_ID` for passkeys; copy `.env.example` and fill in what you
need. Passkey transactions additionally require the relying-party domain files
to be published and the custom development client to be installed — the Expo Go
app will not load the native passkey module, so run `npm run start:dev`.

<details>
<summary>Redeploying (only if the contract changes)</summary>

Use an encrypted Foundry keystore. **Never put a private key in a file or paste
one into chat.**

```sh
cast wallet new deployer          # once; prompts for a password
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast --account deployer \
  --verify --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/
```

`Deploy.s.sol` refuses any chain other than Monad testnet and asserts the AUSD
address has contract code and reports 6 decimals before broadcasting; it never
deploys the local `MockUSD`. Afterwards update `chitCircle` and `deployBlock` in
`sdk/src/config.ts` — take `deployBlock` from the receipt, not an earlier guess,
since circle discovery scans logs from it.

</details>

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
- The ChitCircle contract is deployed and Sourcify-verified on Monad testnet,
	and its address, deploy block and the official AUSD address are configured in
	the SDK, so no `.env` is required to run against the live deployment.
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

## Known limitation: what defaulting costs

A member's deposit covers exactly one missed contribution. In a circle of three
or more, a member who misses a payment is locked out of contributing again but
still receives their scheduled payout, so defaulting can leave them ahead while
a member who paid in full absorbs the shortfall.
`contracts/test/DefaultEconomics.t.sol` measures this rather than describing it.

A production version would size the deposit to each member's full remaining
exposure, or forfeit a defaulter's payout. We are shipping the simple version
and saying so.

## External code used

All application code in this repository was written during the hackathon. We
build on these third-party libraries, used as published:

| Library | Used for |
|---|---|
| [`@category-labs/mera`](https://github.com/category-labs/mera) | Passkey (WebAuthn PRF) accounts and signing sessions |
| [`viem`](https://viem.sh) | Typed Ethereum RPC, ABI encoding, wallet clients |
| [`@scure/bip32`, `@scure/bip39`](https://github.com/paulmillr/scure-bip32) | Deterministic key derivation from the passkey PRF output |
| [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) | SHA-256 for bid salts |
| [Foundry](https://getfoundry.sh) (`forge`, `cast`, `anvil`) + `forge-std` | Contract build, tests, deployment, local chain |
| [Expo](https://expo.dev) / [React Native](https://reactnative.dev) | Mobile app shell |
| [`react-native-passkey`](https://github.com/f-23/react-native-passkey) | Native WebAuthn bridge on iOS/Android |
| [`expo-secure-store`](https://docs.expo.dev/versions/latest/sdk/securestore/) | Storing non-secret passkey credential metadata |

External contracts we interact with but do not own: Agora's **AUSD** token and
its faucet on Monad testnet (addresses above).

## AI-tool disclosure

AI coding assistants were used during this project, as permitted by the
hackathon rules. Specifically, **Anthropic's Claude (via Claude Code)** was used
for:

- drafting and reviewing TypeScript in the SDK (including `sdk/src/mera.ts`,
  `gas.ts`, `mock.ts` and their tests), and the Solidity test
  `contracts/test/DefaultEconomics.t.sol`;
- investigating third-party behaviour we then verified on-chain ourselves — the
  AUSD faucet's global cooldown and 6-decimal denomination, and Mera's key
  handling;
- reconciling the team's branches, and writing parts of this README and
  `docs/api.md`.

Every AI-assisted change was reviewed by a team member, and the test suites and
the live-testnet lifecycle run in this repository are our verification of it.
Design, architecture and all product decisions are the team's own.

## License

[MIT](LICENSE)
