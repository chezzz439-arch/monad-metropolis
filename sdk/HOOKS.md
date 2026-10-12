# Hook layer — what the screens call

For Sohan and Aadit. Everything below typechecks against the deployed ABI
(`forge build` → `npm run abi`), so the names and shapes here are real, not
planned. Import from `@chitcircle/sdk`.

**One rule:** screens never talk to the chain. If you need a value that isn't
here, ask rather than reaching for viem directly — it probably belongs in
`client.ts`.

---

## Setup (done once, by me)

```tsx
import { clientFor, monadTestnet, requireDeployment } from "@chitcircle/sdk";

const client = clientFor(requireDeployment(monadTestnet));

<ChitCircleProvider value={client}>
  <App />
</ChitCircleProvider>
```

`monadTestnet` in `src/config.ts` holds the chain id, RPC, and official Monad
testnet AUSD address. The ChitCircle address and **deploy block** are supplied
after deployment. `requireDeployment` throws a named error for whatever is
still missing rather than handing back a half config. Don't hardcode addresses
in a screen.

Pass `meraSigner(account, rpcUrl)` to `clientFor` after passkey sign-in to enable
writes. The Mera session's contract/amount/expiry checks for prompt-free
contributions are enforced by app code, not by the signing key itself. The
native Mera adapter requires a custom development build; it does not run in
Expo Go.

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
// "https://chitcircle.app/c/7?chain=10143&at=0x..."

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

## Not ready yet

| Thing | State |
|---|---|
| Native Mera use | Implemented in `src/mera.ts`; requires an HTTPS relying-party host and native association files before ceremonies work. |
| Bid mode (`commitBid` / `revealBid`) | Contract reverts `NotImplemented`. Stretch goal — don't build bid UI yet. |
| ChitCircle address and deploy block | Fill in after the Monad testnet deployment. Official AUSD address is configured. |
| Invite landing page | Not built. Until it exists, an https link opens a browser, not the app. |
| Roster-wide defaulted badges | `client.getRoster(circleId)` returns `MemberStatus[]` for every member. Not yet wrapped in a hook — ask if you want one. |

## Running it

```bash
cd sdk && npm install
npm run typecheck   # clean as of this commit (src and test)
npm test            # 12 passing — invite parsing and money/timer formatting
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
