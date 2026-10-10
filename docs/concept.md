# Chit Circle

**Savings circles where no one can run off with the pot.**

| | |
|---|---|
| Track | Consumer Products & Payments |
| Bounties | Agora Cross-Border Payments ($10k) · Best Mera-Powered UX ($2.5k) · Mera: One Passkey, Many Keys ($2.5k, stretch) |
| Deadline | **Tue Oct 13, 2026, 11:59 PM ET.** Plan to submit by 6 PM. |
| Team | Kaushik · Sohan · Aadit · Rohan |

---

## 1. The problem

Rotating savings circles are one of the most widely used financial tools in the world. They go by different names: **chit funds / committees** (India, Pakistan), **susu / ajo / esusu** (West Africa), **tandas** (Mexico, Latin America), **paluwagan** (Philippines), **hui** (China, Vietnam).

How they work:

- A group agrees to pay a fixed amount every round, e.g. $100 a month for 5 months.
- Each round, one member takes the whole pot ($500).
- By the end, everyone has paid in $500 and received $500. The early receivers got an interest-free loan, and the late receivers saved with discipline.

What goes wrong:

1. **The organizer holds the money** and can disappear with it.
2. **Early receivers stop paying** once they've had their payout.
3. **Bidding gets rigged.** In the Indian bidding version, members bid a discount to take the pot early, and organizers can manipulate the bids.
4. **Members now live in different countries,** so collecting money across borders is slow and expensive.

So these groups only work between people who already trust each other completely, and they still fail.

## 2. Why this needs a blockchain

The test we used: *could a bank or fintech app do this the same way?* For Chit Circle, no:

| Need | Onchain answer | Why a regular app can't do it the same way |
|---|---|---|
| No one holds the pot | A smart contract holds the AUSD | An app company would become the custodian, which is the same trust problem plus licensing |
| Defaulters pay a price | A deposit is locked at joining and taken automatically if a payment is missed | It's enforced by code, so nobody has to chase anyone |
| Fair bidding | Sealed bids, revealed together, settled by the contract | Bids and results are public and verifiable by everyone |
| Members in different countries | Everyone pays in and gets paid in AUSD; settles in seconds on Monad | One shared pool across several countries' banks isn't possible |
| Anyone can trigger payout | `settleRound()` can be called by any member once the deadline passes | No organizer or backend server needed |

**About prior attempts:** onchain savings circles were tried around 2017 (e.g. WeTrust). They needed crypto wallets, seed phrases and volatile tokens. Our angle is that **passkeys + stablecoins + fast settlement** finally make it usable by people who have never used crypto. That's the track's core question.

## 3. Who it's for

**First segment: Indian diaspora friend and family circles (US, UK, Canada ↔ India).** The team can recruit testers from its own networks for the "Traction & Path Forward" criterion. The same product works for susu, tanda and paluwagan groups.

**Distribution plan for the pitch:** existing circles already have a WhatsApp group. One invite link brings in the whole group, so each new circle brings in 5–20 users.

**Legal note:** formal chit funds are regulated in India (Chit Funds Act, 1982). Position this as a tool for informal circles among people who already know each other, and say a compliance review comes before launch. We are not lawyers.

## 4. User workflow

### Fixed-order circle (core build)

```
ORGANIZER                         MEMBERS (any country)                 CONTRACT
─────────                         ─────────────────────                 ────────
1. Sign up: one passkey prompt
2. Create circle:
   $100 × 5 members, round
   length, payout order
   → share invite link  ───────▶ 3. Tap link → one passkey prompt
                                    → account created (no seed,
                                    no extension, no email code)
                                 4. Join: lock deposit ($100 AUSD)  ───▶ holds deposits
                                 5. Each round: "Pay $100"
                                    (signing session, no prompt)    ───▶ holds pot
                                                                         round deadline passes
                                 6. Anyone taps "Settle round"      ───▶ pays pot to this
                                                                         round's recipient
                                 7. Recipient sees "+$500 AUSD,
                                    settled in X.X s"
   If someone misses a payment:                                    ───▶ takes their deposit to
                                                                         fill the pot; marks
                                                                         them as defaulted
8. Last round done → deposits returned to everyone in good standing
```

### Bidding circle (stretch, needed for the Many Keys bounty)

Each round, members who haven't received the pot yet can bid a **discount**: "I'll take $500 now for only $460."

1. **Commit:** the app asks Mera for key material derived from the passkey with salt `chitcircle:bid:<circleId>:<round>`. It submits `hash(discount, derivedSecret)`. Nothing is stored on the device or server.
2. **Reveal:** after the bidding deadline, each bidder reveals. The secret is **re-derived from the passkey**, so it works from any device, even after the browser has been wiped.
3. **Settle:** the highest discount wins. The winner gets pot − discount, and the discount is split as a **dividend** among the other members.

This fixes a real problem with sealed bids: normally you have to save a secret to reveal later, and if you lose it you lose your bid. Here the passkey *is* the secret. That makes it a non-wallet use of PRF and passes the bounty's "cross-device test."

### Member-to-member send (needed for the Agora bounty)

Any member can **send AUSD directly to another member**, e.g. "cover Priya's share this month" or "send my payout to Mom in Pune." This makes the plain cross-border send/receive the Agora bounty asks for obvious in the demo.

## 5. Architecture

```
┌──────────────────────────── Mobile app (React Native) ─────────────────────────────┐
│  Onboarding        Circle screens          Send / Receive        Bid (stretch)      │
│  Mera passkey      create/join/pay/settle  member→member AUSD    commit / reveal    │
│        │                  │                       │                    │            │
│        └───── Mera account + signing session ─────┘          Mera PRF key material  │
└───────────────────────────────────┬─────────────────────────────────────────────────┘
                                    │ transactions
                    ┌───────────────▼────────────────┐
                    │  Monad testnet                  │
                    │  ChitCircle.sol  ⇄  AUSD token  │
                    └───────────────┬────────────────┘
                                    │ events (reads)
                       app reads contract state directly
                       (optional: Envio indexer for history)
```

### Contract: `ChitCircle.sol` (Foundry)

| Function | What it does |
|---|---|
| `createCircle(token, contribution, maxMembers, roundSeconds, mode, payoutOrder)` | Organizer sets the rules. `mode` = Fixed or Bid |
| `join(circleId)` | Pulls the deposit (= 1 contribution) and adds the member |
| `contribute(circleId)` | Pulls this round's contribution |
| `settleRound(circleId)` | Callable by anyone after the deadline. Takes deposits from members who didn't pay, pays the recipient, moves to the next round |
| `commitBid(circleId, hash)` / `revealBid(circleId, discount, secret)` | Bid mode only |
| `withdrawDeposit(circleId)` | After the final round, for members in good standing |
| Events | `Joined`, `Contributed`, `Defaulted`, `RoundSettled`, `BidCommitted`, `BidRevealed` |

**Limit to state honestly in the pitch:** a deposit of one contribution covers one missed payment. A member who already got the pot and then stops paying for several rounds can still cost the group money. Mitigations to mention: larger deposits for early slots, letting people with a good record onchain pick earlier slots, and making early slots go by bid.

### Mera usage

| Feature | How we use it | Bounty criterion |
|---|---|---|
| Passkey onboarding | One ceremony creates the account | Agora (required), Mera UX "one-prompt onboarding" |
| Signing session | No prompt for `contribute()` to the user's own circles up to the contribution amount. Re-prompt for sends, joins and anything else. Show a session-expiry banner | Mera UX "session design" |
| Stateless check | All state lives onchain or comes from the passkey, so clearing storage loses nothing | Mera UX "stateless test" |
| PRF key material | Bid secrets per circle and round | Many Keys |

**Check in the Mera docs on day 1:** what limits a signing session can enforce (by contract? by amount?). If it can't limit by contract or amount, enforce the limits in the app and say so plainly. Don't claim it's enforced at the protocol level.

## 6. How it scores

### Track judging criteria

| Criterion | Weight | How Chit Circle addresses it |
|---|---|---|
| Technical Execution | 20% | Real deposits, taken deposits and payouts on Monad testnet. Nothing is simulated |
| Design & Craft | 20% | Users only see a passkey prompt, "Pay $100" and "You received $500". The words "wallet" and "gas" never appear |
| Originality & Track Insight | 15% | A decades-old informal finance tool made trustless. It isn't a rebranded wallet |
| Founder & Market Readiness | 25% | Named segment (diaspora circles); the team knows these circles personally |
| Traction & Path Forward | 20% | Test with 5+ real circle members before Oct 12. WhatsApp-group distribution |

### Bounty requirements

| Bounty | Required | Where it shows in the demo |
|---|---|---|
| Agora | Mobile app, Mera passkey onboarding, AUSD balance, completed send/receive settled instantly | Onboarding → balance → member-to-member send + pot payout, with timer |
| Mera UX | Testnet + real transactions, one-prompt onboarding, scoped signing session, stateless test | Same, plus clear storage mid-demo and log back in |
| Many Keys | At least one PRF namespace doing non-account work, shown live | Commit a bid on phone A, reveal it on phone B |

Rules reminder: sponsor bounties are judged **40% on following the published requirements**. Every required item must be clearly visible in the video.

## 7. Demo script (≤ 3 minutes)

| Time | What's on screen |
|---|---|
| 0:00–0:20 | The problem in one line: "Savings circles run on trust alone. Here's one that runs on code." |
| 0:20–0:45 | Kaushik creates a circle on phone A with one passkey prompt. Invite link opened on phone B, one prompt, joined |
| 0:45–1:15 | Both lock deposits and pay round 1 with no prompts. "Settle round" → payout lands with the **settled-in timer** showing |
| 1:15–1:45 | Round 2: one member doesn't pay → settle → **deposit taken, pot still full**, "Defaulted" badge |
| 1:45–2:10 | Member-to-member AUSD send ("cover my cousin's share") settles instantly |
| 2:10–2:35 | **Stateless test:** clear app storage → passkey → everything comes back |
| 2:35–2:55 | (If built) bid committed on phone A, revealed on phone B, dividend paid out |
| 2:55–3:00 | Transaction hashes on the Monad explorer |

## 8. Work split (branches)

| Branch | Owner | Builds |
|---|---|---|
| `kaushik` | Kaushik (lead, backend) | **Smart contract:** `ChitCircle.sol` + Foundry tests, Monad testnet deploy, AUSD wiring, contract addresses + tx hashes for the README. **Mera:** passkey onboarding, signing session + limits, stateless flow, PRF bid secrets (stretch). **Integration:** the app's data/transaction layer (hooks the UI calls for create/join/pay/settle/send/bid), so the others only build screens on top |
| `sohan` | Sohan | Send/receive screen + settled-in timer · Demo video (≤3 min) · Pitch video (≤2 min) |
| `aadit` | Aadit | Circle screens UI: create / join / pay / settle · Defaulted badges, local-currency display, UI polish · README: setup, license, AI-tool disclosure, architecture, external code list |
| `rohan` | Rohan | User tests with 5+ real circle members (record quotes) · Logo + optional 30-sec product ad · Submission form + selecting track and bounties on the hackathon site |

The split for Sohan, Aadit and Rohan was randomized. Swap tasks among yourselves if skills fit better.

**Hand-off that unblocks everyone:** Kaushik publishes the hook names and what each returns by **Sat Oct 10, midday**. Until then, Sohan and Aadit build screens against mock data with the same shape.

Merge into `main` through pull requests. Freeze `main` at **Oct 13, 12 PM ET**.

## 9. Schedule

| Day | Goals |
|---|---|
| **Fri Oct 9 (tonight)** | Confirm the testnet AUSD source with Agora (Discord). Kaushik: passkey login working on a real phone + contract skeleton. Sohan/Aadit: screen layouts on mock data. Rohan: line up testers |
| **Sat Oct 10** | Contract deployed with tests. App: create/join/pay against testnet |
| **Sun Oct 11** | Full fixed-order flow working end to end, including deposit taken on a missed payment. Member-to-member send. Start bid mode only if all of this works |
| **Mon Oct 12** | User tests (record quotes), polish, record videos, write README |
| **Tue Oct 13** | Final fixes, submit by 6 PM ET. Select the track + Agora + Mera UX (+ Many Keys) bounties |

**Demo-speed setting:** use a round length of 1–2 minutes for the demo. The real product would use monthly rounds.

## 10. Risks

| Risk | Impact | Plan |
|---|---|---|
| No testnet AUSD | We miss the Agora bounty ($10k) | Ask Agora tonight. Check docs.agora.finance/contract-overview. Fallback decision by Sat noon |
| Mera React Native issues | Blocks everything | Kaushik tests the React Native recipe first thing. Fallback: mobile web app (PWA) with passkeys. Check this still counts as "mobile app" for Agora |
| Signing session limits weaker than planned | Lower Mera UX score | Enforce in the app and say so honestly |
| Bid mode doesn't finish | Lose Many Keys only | It's a stretch goal; the fixed-order flow is enough for everything else |
| Judges see "lending circle" as old | Lower originality score | Lead with the defaulter-deposit moment and the passkey UX |

## 11. Submission checklist

- [ ] Logo (JPG/PNG/WEBP, ≤3MB)
- [ ] Public GitHub repo, shared with metropolis@hackathon.monad.xyz: source, README with setup steps, open-source license, list of external code used, AI-tool disclosure, commits during the build window
- [ ] Contract addresses + transaction hashes in README
- [ ] Demo video ≤3 min (live product, Monad transactions shown)
- [ ] Pitch video ≤2 min (team, problem, why us)
- [ ] Live product link + judge access instructions
- [ ] Track: Consumer Products & Payments
- [ ] Bounties: Agora Cross-Border Payments, Best Mera-Powered UX, Mera: One Passkey, Many Keys
- [ ] Optional: 30-sec product ad
