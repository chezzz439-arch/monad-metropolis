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
<ChitCircleProvider value={client}>
  <App />
</ChitCircleProvider>
```

Until Mera is wired, `client` has no signer and every write throws
`"No signer: sign in with a passkey first."` Reads work fine, so build and style
screens against real chain data now.

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
| `useRoundCountdown(roundDeadline)` | `number` | Seconds left, ticking locally every 1s. Pass `circle.roundDeadline`. |
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
plain read — it does **not** poll. Pass its `refresh` as the `onSuccess` of
`useCreateCircle` / `useJoinCircle`.

**Sharing a circle.** Build the link, hand it to the share sheet:

```ts
buildInviteLink(circleId, { chainId, contract })
// "https://chitcircle.app/c/7?chain=10143&at=0x..."

buildDeepLink(circleId, { chainId, contract })
// "chitcircle://circle/7?chain=10143&at=0x..."
```

Use the **https** form for WhatsApp — a custom scheme renders as dead text
there, and §3's whole distribution plan is one link in an existing group chat.

**Opening a link.** `useInvite` parses it, verifies it belongs to this
deployment, and loads the circle. Switch on `status`, which separates the
failures that need different copy:

| `status` | What to show |
|---|---|
| `idle` | No link yet |
| `invalid` | "That doesn't look like a Chit Circle invite" |
| `wrong-deployment` | Link is for another chain or contract — `error.message` says which |
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
| Mera passkey sign-in, signing session, PRF | `src/mera.ts` — stubs, throw on call. SDK shapes unconfirmed as of Oct 9; not guessing them. |
| Bid mode (`commitBid` / `revealBid`) | Contract reverts `NotImplemented`. Stretch goal — don't build bid UI yet. |
| AUSD token address | Unconfirmed with Agora. Pass it in; don't hardcode. |
| Contract address | Not deployed yet. Same. |
| Roster-wide defaulted badges | `client.getRoster(circleId)` returns `MemberStatus[]` for every member. Not yet wrapped in a hook — ask if you want one. |

## Running it

```bash
cd sdk && npm install
npm run typecheck   # clean as of this commit
npm test            # 12 passing — invite parsing and money/timer formatting

cd ../contracts && forge build && cd ../sdk && npm run abi   # after contract changes
```

`npm test` covers the pure logic only (link parsing, formatting). Anything that
touches the chain is unverified until the contract is deployed.
