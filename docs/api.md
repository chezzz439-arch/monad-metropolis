# Hook layer — what the screens call

For Sohan and Aadit. Everything below typechecks against the deployed ABI
(`forge build` → `npm run abi`), so the names and shapes here are real, not
planned. Import from `@chitcircle/sdk`.

**One rule:** screens never talk to the chain. If you need a value that isn't
here, ask rather than reaching for viem directly — it probably belongs in
`client.ts`.

---

## Start here: build against the mock today

**You are not blocked on my deploy.** `mockClient()` is a full in-memory
ChitCircle. Point the provider at it and every hook below works right now — no
chain, no testnet AUSD, no passkey, no network at all.

```tsx
import { ChitCircleProvider, mockClient } from "@chitcircle/sdk";

// Memoize it. A new client each render means new state each render.
const client = useMemo(() => mockClient({ scenario: "midRound" }), []);

<ChitCircleProvider value={client}>
  <App />
</ChitCircleProvider>
```

When your screen is done, that one line becomes
`clientFor(requireDeployment(monadTestnet))` and **nothing else in your screen
changes.** The contract is live on testnet now, so that swap works today — but
the mock is still the faster way to build, because it has no round deadlines to
wait out and no test money to fetch. `mockClient` returns a real
`ChitCircleClient` subclass, so you call the same hooks and get the same
`CircleView` you will get from Monad. Please don't build against hand-made
fixture objects — they would have to be torn out later.

### Scenarios

Pick the situation you need to design for:

| `scenario` | What you get |
|---|---|
| `"empty"` | No circles. Home's empty state, then Create. |
| `"filling"` | 3 of 5 joined, not started. Join screen, "waiting for members". |
| `"midRound"` *(default)* | Round 1 open, 2 of 5 paid, **you have not** — "Pay $100" and a live countdown. |
| `"settleable"` | Deadline passed, everyone paid — "Settle round" is live for any member. |
| `"defaulted"` | Round 1 settled with Priya missing — **Defaulted badge** and "deposit covered the pot". |
| `"finished"` | All 5 rounds done. Everyone paid in $500 and got $500; deposit withdrawable. |

The seeded circle is the demo one: $100 a round, 5 members, 2-minute rounds.
`MOCK_PEOPLE` gives you those five addresses with names (You, Priya, Arun,
Meera, Dev) so the roster reads like a real circle — but **the chain has no
names**, so fall back to `shortAddress()` when `nameFor()` returns undefined.
Build that in now rather than discovering it on Sunday.

### Other options

```ts
mockClient({ scenario: "midRound", me: MOCK_PEOPLE[1].address })  // view it as Priya
mockClient({ scenario: "midRound", signedOut: true })             // writes throw "sign in with a passkey"
mockClient({ scenario: "midRound", latencyMs: 1200 })             // slow confirmation; test the spinner
client.warp(130)                                                  // jump past the round deadline
```

`signedOut` is how you build the sign-in gate before Mera is wired. `warp` is
how you reach a settle without waiting two minutes.

### It fails the way the chain fails

Writes reject with a `MockRevert` carrying the contract's own error name, so
your error handling is real rather than invented:

```ts
const pay = useContribute();
await pay.run(circleId);
pay.error        // Error | null  — `run` still never throws
// (err as MockRevert).reason === "AlreadyPaid" | "HasDefaulted" | "RoundStillOpen" | ...
```

The mock mirrors `ChitCircle.sol` rule for rule — a circle starts by itself on
the last join, a missed payment seizes that member's deposit to keep the pot
whole, `settleRound` refuses before the deadline, a defaulted member cannot pay
back in. `sdk/test/mock.test.ts` asserts all of it. If the mock and the chain
ever disagree, that is my bug — tell me instead of working around it.

## Setup (done once, by me) — the real client

```tsx
import { clientFor, monadTestnet, requireDeployment } from "@chitcircle/sdk";

const client = clientFor(requireDeployment(monadTestnet));

<ChitCircleProvider value={client}>
  <App />
</ChitCircleProvider>
```

`monadTestnet` in `src/config.ts` holds the chain id, RPC, contract address,
AUSD address and **deploy block** in one place — all filled in and verified
against the live chain. `requireDeployment` throws a named error for anything
missing rather than handing back a half config. Don't hardcode an address in a
screen.

A `client` built this way has no signer, so reads work and every write throws
`"No signer: sign in with a passkey first."` Pass `meraSigner(account, monadTestnet.rpcUrl)`
as the second argument once you have an account — see "Passkey accounts" below.

## Every hook returns one of two shapes

```ts
// reads
{ data: T | null, loading: boolean, error: Error | null, refresh: () => void }

// writes
{ run: (...args) => Promise<TxResult | null>, pending: boolean, error: Error | null, result: TxResult | null }
```

`run` **never throws** — it resolves `null` on failure and puts the reason in
`error`. So: disable the button on `pending`, show `error?.message`, and read
`result.settledInSeconds` for the settled-in timer.

```ts
interface TxResult { hash: `0x${string}`; settledInSeconds: number }
```

## Reads

| Hook | Returns | Notes |
|---|---|---|
| `useCircle(circleId, me?, pollMs?)` | `CircleView` | Everything a circle screen needs. Polls every 4s, so other members' payments appear on their own. |
| `useMyCircles(me, opts?, pollMs?)` | `CircleView[]` | The home-screen list. Event-log scan — **does not poll by default**, call `refresh` after a create or join. |
| `useInvite(link, expected?)` | `CircleView` + `status` | Resolves an invite link. See below. |
| `useTokenBalance(token, account, pollMs?)` | `bigint` | AUSD balance for the header. |
| `useRoundCountdown(circle)` | `number` | Seconds left, ticking locally every 1s. Pass the whole `circle`, not the deadline. |
| `useRefreshOnFocus(refresh, subscribe?)` | — | Re-runs a read when the app returns to the foreground. See below. |
| `usePrimaryAction(circle)` | `CircleAction` | The one button this screen should show — see below. |

### `CircleView`

```ts
{
  circleId: bigint
  token: Address
  contribution: bigint      // smallest unit; AUSD has 6 decimals
  maxMembers: number
  roundSeconds: bigint
  mode: 0 | 1               // Mode.Fixed | Mode.Bid
  round: number             // 0-based, round in progress
  roundDeadline: bigint     // unix seconds; 0n until the circle fills
  pot: bigint               // held for the round in progress
  started: boolean
  finished: boolean

  members: Address[]        // join order; index = slot
  payoutOrder: number[]     // slot indices, in payout order
  recipient: Address | null // who gets the pot this round; null until started
  outstanding: Address[]    // who still owes this round
  secondsUntilSettle: number
  settleable: boolean       // deadline passed; anyone may settle
  expectedPot: bigint       // maxMembers * contribution
  me: MemberStatus | null   // null when no account is connected
}
```

### `MemberStatus` (`circle.me`)

```ts
{
  address: Address
  isMember: boolean
  deposit: bigint           // 0n once seized or withdrawn
  defaulted: boolean        // -> show the Defaulted badge
  depositWithdrawn: boolean
  paidThisRound: boolean
  slot: number              // -1 if not a member
  payoutRound: number       // which round they receive; -1 if not a member
}
```

**Defaulted badges:** `circle.me.defaulted` for the current user; for the roster,
a member is defaulted if they appear in `outstanding` after a settle, or read it
per-member. Ask me for a roster-wide status read if you want one call.

## Writes

| Hook | `run(...)` |
|---|---|
| `useCreateCircle()` | `run({ token, contribution, maxMembers, roundSeconds, mode?, payoutOrder? })` |
| `useJoinCircle(onSuccess?)` | `run(circleId)` |
| `useContribute(onSuccess?)` | `run(circleId)` |
| `useSettleRound(onSuccess?)` | `run(circleId)` |
| `useWithdrawDeposit(onSuccess?)` | `run(circleId)` |
| `useSendToMember(onSuccess?)` | `run(token, to, amount)` |

Pass `refresh` from `useCircle` as `onSuccess` to repaint immediately instead of
waiting for the next poll.

Notes that will save you debugging:

- **`payoutOrder` is slot indices, not addresses** — it's fixed at creation,
  before anyone has joined. Omit it and it defaults to join order.
- **ERC20 approval is automatic.** `join` and `contribute` approve first if
  needed, so there's no separate approve button.
- **`settleRound` is callable by anyone** once `settleable` is true. That's the
  "no organizer" point of the demo — let any member tap it.
- **`sendToMember` is a plain ERC20 transfer.** It deliberately doesn't touch
  ChitCircle, so the Agora send/receive stays one hop.

## `usePrimaryAction` — the one button

```ts
{ kind: "join" | "pay" | "settle" | "withdraw" | "waiting" | "none", label: string }
```

Already handles: not-yet-full, paid-vs-unpaid, deadline passed, finished,
deposit still claimable, defaulted. Render `label`, switch the handler on `kind`,
and disable for `waiting` / `none`. If it ever picks the wrong button that's my
bug, not yours — tell me instead of special-casing in the screen.

## Discovery and invite links

**Home screen.** `useMyCircles(me)` returns every circle this account organized
or joined. It scans `CircleCreated` and `Joined` logs, so it is slower than a
plain read — it does **not** poll. Three things should refresh it:

```tsx
const { data: circles, loading, refresh } = useMyCircles(me);

// 1. after a create or join
const create = useCreateCircle();   // pass `refresh` as onSuccess on join/contribute
// 2. when the app comes back to the foreground
useRefreshOnFocus(refresh, (onFocus) => {
  const sub = AppState.addEventListener("change", (s) => s === "active" && onFocus());
  return () => sub.remove();
});
// 3. pull-to-refresh
<FlatList refreshing={loading} onRefresh={refresh} ... />
```

The `AppState` argument is required on React Native — the SDK does not import
`react-native` itself, so without it `useRefreshOnFocus` is a silent no-op.
A fresh device (the stateless test) does a full scan on first load anyway.

**Sharing a circle.** Build the link, hand it to the share sheet:

```ts
buildInviteLink(circleId, { chainId, contract })
// "https://chit-circle.vercel.app/c/7?chain=10143&at=0x..."

buildDeepLink(circleId, { chainId, contract })
// "chitcircle://circle/7?chain=10143&at=0x..."
```

Use the **https** form for WhatsApp — a custom scheme renders as dead text
there, and §3's whole distribution plan is one link in an existing group chat.

> **The https link does not open the app on its own.** Tapping it opens the
> browser unless the domain is configured for universal links (iOS) / app links
> (Android), which we are not doing before Tuesday. The plan is a tiny page at
> the product URL that tries `chitcircle://circle/<id>?…` and otherwise shows
> "Open in Chit Circle" plus install steps. Noted in `docs/concept.md` §3.
> Whoever builds it: test by tapping the link **inside WhatsApp on a real
> phone**, not a simulator — in-app browsers are where this breaks.

**Opening a link.** `useInvite` parses it, verifies it belongs to this
deployment, and loads the circle. Switch on `status`, which separates the
failures that need different copy:

| `status` | What to show |
|---|---|
| `idle` | No link yet |
| `invalid` | "That doesn't look like a Chit Circle invite" |
| `wrong-deployment` | "This invite is from an older version of the app. Ask for a new link." — `error.message` has the chain/contract detail, keep it out of the user's face |
| `not-found` | Well-formed link, no such circle |
| `ready` | `data` is the `CircleView`; show the join screen |
| `error` | Network or RPC failure; `refresh` to retry |

```ts
const { data, status, error } = useInvite(link, { chainId, contract });
```

`wrong-deployment` matters more than it looks: circle ids restart at 0 on every
deployment, so a stale link from an earlier deploy would otherwise silently
join a *different* circle with the same number.

**Caveat I want you to know about:** discovery reads logs directly from the RPC
in 10,000-block chunks. It works and it's tested, but if the testnet RPC caps
log ranges harder than that, `useMyCircles` will be slow or error — lower
`maxBlockRange` via `opts`. If it becomes a problem on demo day, the fallback is
an Envio index, and that's my job, not yours. Tell me rather than working around it.

## Formatting

Don't hand-roll money or timers.

```ts
formatUsd(100_000_000n)        // "$100.00"
formatAmount(100_500_000n)     // "100.50"
parseAmount("100.5")           // 100500000n  (throws on bad input)
formatCountdown(92)            // "1:32"
formatSettled(1.37)            // "settled in 1.4s"
shortAddress("0x1234…")        // "0x1234…abcd"
AUSD_DECIMALS                  // 6
```

## Passkey accounts

Sign-up is one ceremony. Sign-in is one ceremony. Nothing is stored anywhere.

```ts
const options = {
  rpId: process.env.EXPO_PUBLIC_MERA_RP_ID,   // a host we control, or "localhost"
  contract: monadTestnet.chitCircle,          // what the prompt-free path is scoped to
  maxAmountPerTx: parseAmount("100"),
};

// New user. One fingerprint/face prompt, and they have an account.
const account = await createPasskeyAccount(options);

// Returning user, or a device that has never seen this app. Same account.
const account = await signInWithPasskey(options);

// A new account cannot pay for its first action, so seed it first.
await dripper.ensure(account.address);     // one on-chain tx — NOT instant

const client = clientFor(monadTestnet, meraSigner(account, monadTestnet.rpcUrl));
```

`signInWithPasskey(options)` with no `credential` is the **stateless restore**:
WebAuthn offers any passkey for `rpId`, and the same passkey always produces the
same account. Clear app storage, use another phone — same account, nothing lost.
That is the Mera UX bounty's test and it needs no code from you.

### When the user is asked to confirm

Every write re-prompts for the passkey, with one exception: a `contribute` whose
amount passes `sessionGuard` is signed from the live session with no prompt. That
is the "tap Pay, it just pays" moment. `client.contribute()` declares the amount
for you, so you get this for free — and nothing else is ever silent, including
member-to-member sends.

Things to get right in the UI:

| Rule | Why |
|---|---|
| After the passkey prompt, show "Setting up your account…" | Funding the new account is a real transaction. Jumping straight to Home shows an account that cannot pay yet. |
| Show `describeMeraError(err)`, never `err.message` | Mera's own errors mention authenticators and crypto. `describeMeraError` is tested to never use the six banned words, for every error code and for unrecognised ones. |
| Expect a prompt on join, settle, withdraw and send | Only a capped contribution skips it. Don't build a UI that assumes those are instant. |
| Call `endMeraSession(account)` on sign-out | It zeroes the in-memory key. Dropping the object alone does not. |

**Passkeys need a native build.** `nativeWebAuthnClient()` throws
"Passkeys require a native development build" under Expo Go and under node, so
run the demo with `npm run start:dev`, not `npm start`. An HTTPS `rpId` also
needs the Apple/Android association files published — see
`scripts/generate-passkey-associations.mjs`.

**Be honest about the limits in the demo and the pitch.** Mera has no concept of
session limits: no contract allow-list, no per-transaction cap, no expiry. Ours
are enforced by `sessionGuard` in our own process, which is why it has tests.
Saying "the protocol enforces this" would be untrue.

## Not ready yet

| Thing | State |
|---|---|
| Mera passkey sign-in, signing session, PRF | **Written** against `@category-labs/mera` 0.2.0 — see "Passkey accounts" above. Typechecks, and 26 tests cover key derivation, the limit guard and which writes are allowed to skip the prompt. **The ceremony itself has not been run against a real authenticator on this branch**: WebAuthn needs a device, and that test is a phone, not a terminal. Run it with `npm run start:dev` on a real phone before relying on it; keep `mockClient({ signedOut: true })` for the signed-out gate until then. |
| Bid mode (`commitBid` / `revealBid`) | Contract reverts `NotImplemented`. Stretch goal — don't build bid UI yet. |
| Account funding on sign-up | **Done** (`GasDripper` in `gas.ts`), waiting on Mera. **Aadit:** a brand-new account has to be seeded before its first payment, and that is one on-chain transaction, so sign-up is *not* instant — show "Setting up your account…" after the passkey prompt rather than jumping straight to Home. Still one prompt; just not zero wait. |
| AUSD token address | **Confirmed.** `MONAD_TESTNET_AUSD_ADDRESS` in `config.ts`, verified on-chain as 6-decimal "AUSD". |
| ChitCircle address, deploy block | **Live.** `0x13ec22E7d0BF5b728549990aA852d03BCC9da73D`, block 70523429, Sourcify-verified. Filled into `monadTestnet`, so `clientFor(monadTestnet)` now works against the real chain. The mock is still the faster way to build screens — switch when your screen is done, not before. |
| Getting test dollars (AUSD faucet) | Works, but the faucet's 60-second cooldown is **global**, not per user — a second address was refused (`MaxFrequencyExceeded`) right after an unrelated one claimed. Don't build a "get test money" button that several people tap at once. Claim once, then `transfer` onward. |
| Invite landing page | Not built. Until it exists, an https link opens a browser, not the app. |
| Roster-wide defaulted badges | `client.getRoster(circleId)` returns `MemberStatus[]` for every member. Not yet wrapped in a hook — ask if you want one. |

## Running it

```bash
cd sdk && npm install
npm run typecheck   # clean as of this commit (src and test)
npm test            # 52 passing — mock state machine, passkey limit guard, gas drip, invites, formatting
npm run test:e2e    # 15 passing — the whole flow on a local anvil chain

cd ../contracts && forge build && cd ../sdk && npm run abi   # after contract changes
```

`npm test` is pure logic and needs nothing installed. `npm run test:e2e` needs
Foundry: it starts an `anvil`, deploys `ChitCircle` + a 6-decimal `MockUSD` via
`contracts/script/DeployLocal.s.sol`, and runs create → join → contribute →
settle → default → member-to-member send through the real client, including the
log-scan discovery. So the chain-facing code is tested, not just the pure logic.
If a hook misbehaves, that suite is where I'll reproduce it — tell me the
sequence of taps.
