# Monad Metropolis Hackathon — Consumer Products & Payments Brief

Collected from hackathon.monad.xyz on 22 Sep 2026 (logged-in dashboard). Text inside quote blocks is copied word for word from the site. Notes marked **[Note]** are mine, not the site's.

---

## 1. Agora — Best Cross-Border Payments App on Monad (Agora Payments Bounty)

**Source:** https://hackathon.monad.xyz/tracks/best-cross-border-payments-app-on-monad-agora-payments-bount

**Sponsor:** Agora

**Summary (header):**
> Build a mobile app letting users send AUSD across borders using Mera passkey onboarding and instant settlement.

**Prize:** $10,000 USD
**Prize split:**
> $10,000 USD — single prize

**Track:** Consumer Products & Payments
**Deadline:** Oct 13, 2026 at 23:59 EDT

**About — What this bounty is for**
> A team must build a mobile application that lets a user send AUSD to another person or across borders, using Mera passkey authentication for onboarding and instant settlement for the transfer itself. Teams should build against Agora's public API documentation and staging environment (internal codebase access is not provided).

**Judging criteria — What judges look for**
> - Implementation quality
> - Real-world usability
> - Business viability of the payments flow

(No weights are given on the bounty page.)

**Deliverables — What to have ready**
> - A working demo showing passkey onboarding, an AUSD balance, and a completed send/receive transaction settled instantly

**Suggested starting points:** Not found. The section heading shows but the list is empty.

**Linked resources**
- docs.agora.finance/contract-overview — https://docs.agora.finance/contract-overview
- Build on Monad — https://docs.monad.xyz/developer-essentials/getting-started
- Monad developer portal — https://developers.monad.xyz/
- Metropolis resources — https://hackathon.monad.xyz/resources

**Extra bounty-specific submission fields:** None. The bounty's `requirements` list in the page data is empty.

---

## 2. Monad Foundation — Mera bounties

### 2a. Best Mera-Powered UX on Monad

**Source:** https://hackathon.monad.xyz/tracks/best-mera-powered-ux-on-monad

**Sponsor:** Monad Foundation
**Summary (tracks list):**
> Build an app on Monad where Mera is the entire account layer — no seed phrase, no extension, no custody backend.

**Prize:** $2,500 USD
**Prize split:**
> $2,500 USD — single prize

**Track:** All tracks
**Deadline:** Oct 14, 2026 at 03:59 UTC (same time as Oct 13, 23:59 EDT)

**About — What this bounty is for**
> Build an app on Monad where Mera is the entire account layer. No seed phrase. No wallet extension. No custody backend. The winner is the app where the user never notices there's a blockchain underneath.

**Judging criteria — What judges look for**
> - Time-to-first-transaction — taps and seconds from landing page to confirmed Monad transaction
> - Session design — sensible scoping of prompt-free vs. re-prompt actions, clean session-expiry UX
> - The stateless test
> - Stack composability (bonus) — extra credit for combining Mera with the broader account stack

**[Note]** "The stateless test" has no description under the judging criteria. It is defined in the deliverables below.

**Deliverables — What to have ready**
> - Deployed on Monad testnet or mainnet with real transactions and a live demo
> - One-prompt onboarding — a single passkey ceremony, no seed phrase, extension install, or email/OTP dance
> - Prompt-free signing via Mera signing sessions with a clearly scoped session
> - Must pass the stateless test — judges clear local storage or open the app on a fresh device mid-demo, and identity/access must fully reconstruct from the passkey (plus untrusted storage if used)

**Suggested starting points**
> 01 Combine Mera with the broader account stack: gas sponsorship, intents, recovery flows, smart-account patterns, cross-chain accounts (bonus credit under judging)

**Linked resources**
- https://mera.category.xyz/getting-started/
- https://mera.category.xyz/recipes/use-mera-with-react-native/
- https://github.com/category-labs/mera
- https://mera.category.xyz/recipes/use-mera-with-chrome-extensions/
- https://faucet.monad.xyz/
- Build on Monad — https://docs.monad.xyz/developer-essentials/getting-started
- Monad developer portal — https://developers.monad.xyz/
- Metropolis resources — https://hackathon.monad.xyz/resources

### 2b. Mera: One Passkey, Many Keys

**Source:** https://hackathon.monad.xyz/tracks/mera-one-passkey-many-keys

**Sponsor:** Monad Foundation
**Summary (tracks list):**
> Most creative non-wallet use of Mera's PRF-derived key material.

**Prize:** $2,500 USD
**Prize split:**
> $2,500 USD — single prize

**Track:** All tracks
**Deadline:** Oct 14, 2026 at 03:59 UTC

**About — What this bounty is for**
> Mera's PRF output is deterministic key material, and every salt is an isolated namespace — one passkey can mint unlimited unrelated keys for encryption, identities, or capabilities, all reconstructible from the passkey alone, with zero secrets stored anywhere. This bounty is for the most creative use of that primitive for anything that is NOT signing blockchain transactions from a wallet account.

**Judging criteria — What judges look for**
> - Novelty — the further from "passkey wallet," the better
> - Correct use of the primitives — encryption vs. derivation used appropriately, salts genuinely namespaced, nothing sensitive persisted to disk or server
> - The cross-device test — same passkey on a second device or fresh browser profile reproduces the same derived keys / decrypts the same state, live

**Deliverables — What to have ready**
> - A submission (may include a wallet, but the wallet can't be the point) where at least one PRF namespace does non-account work, demonstrated live

**Suggested starting points**
> 01 Encrypted app state or E2E messaging with per-conversation derived keys
> 02 AI agent memory encrypted to the user's passkey — the agent's context survives any device, readable by no one else
> 03 Per-agent or per-app isolated identities minted from salt namespaces
> 04 Unlinkable per-context privacy identities
> 05 SSH or developer identities derived from a passkey
> 06 Secret vaults that wrap existing credentials (recovery phrases, API keys) under a passkey

**Linked resources**
- https://mera.category.xyz/concepts/passkeys-and-prf/
- https://mera.category.xyz/concepts/secret-vaults/
- https://mera.category.xyz/recipes/use-an-existing-secret/
- https://mera.category.xyz/reference/
- Build on Monad — https://docs.monad.xyz/developer-essentials/getting-started
- Monad developer portal — https://developers.monad.xyz/
- Metropolis resources — https://hackathon.monad.xyz/resources

**Extra bounty-specific submission fields (both Mera bounties):** None. Both `requirements` lists are empty.

---

## 3. Consumer Products & Payments track

**Source:** https://hackathon.monad.xyz/tracks/consumer-payments

**Summary:**
> Consumer-facing financial products that use onchain rails as a design advantage, for users who don't identify as crypto users.

**Prize:** $30,000 USD
> Split evenly among 3 winners - $10,000 each

**Deadline:** Oct 13, 2026 at 23:59 EDT

**About — What this track is for**
> The infrastructure for onchain consumer finance has quietly crossed a threshold — near-instant settlement, gasless accounts, programmable money that can respond to behaviour in real time. This track is for builders who want to close the gap between what those rails make possible and what people can actually use. The products that make crypto feel obvious to someone who never wanted to think about blockchains are still largely unbuilt.
>
> Core question: What does a financial product look like when onchain rails are leveraged as an advantage to design?
>
> Belongs here if: the primary user is a consumer — someone who may not identify as a crypto user — and the core value is a financial experience, not a trading or market-making product.

**Judging criteria — What judges look for**
> Technical Execution (20%) — do the payment/behavioral mechanics actually execute onchain with real conditional logic and settlement, not simulated?
>
> Design & Craft (20%) — would a non-crypto user complete the core flow without confusion or help? This track's central bar is an invisible blockchain — judge harshly on any point of friction that reveals "this is crypto."
>
> Originality & Track Insight (15%) — is this a genuinely new consumer financial experience enabled by onchain rails, or a wallet/payments app with new branding?
>
> Founder & Market Readiness (25%) — is there a specific, named consumer segment this serves, and does the team show real understanding of that user's behavior or pain point — not just "everyone needs payments"?
>
> Traction & Path Forward (20%) — evidence of user testing (even five friends trying it), and a concrete distribution plan — how would the next 100 users actually find this?

**Deliverables — What to have ready**
> Project Logo/Graphic: uploaded in JPG, JPEG, PNG, or WEBP format (maximum size 3MB)
>
> Public GitHub Repository: fully accessible by metropolis@hackathon.monad.xyz
>
> Technical Demo Video: maximum 3 minutes, via YouTube, Loom, or Vimeo — must show the live working product, not slides or a code walkthrough
>
> Pitch Video: maximum 2 minutes, introducing the team, the problem being solved, and why you're building it
>
> Live Product Link: deployed on Monad Mainnet or Testnet, accompanied by clear access instructions and any necessary test login credentials for judges
>
> Product Advertisement (Optional): maximum 30 seconds, via YouTube, Loom, or Vimeo — a short, punchy promotional clip of the product. Not factored into judging; used for post-event social promotion and marketing

**Suggested starting points**
> 01 Payments embedded in social gestures — splitting a bill, sending a gift, tipping a creator — where the financial action feels like a message, not a transaction
> 02 Commitment contracts that put real money behind behavioural goals — reduce screen time, hit a step count, quit a habit — verified automatically by device-native signals, with stakes redistributed to those who follow through
> 03 Accountability pools where groups collectively commit to a shared goal: those who fail fund the rewards of those who succeed
> 04 Income share agreements as a consumer product — fund a friend's course, career move, or creative project in exchange for a programmatic share of future earnings, settled automatically onstream
> 05 Programmable gifts that unlock on conditions — "here's $500 when you graduate", "here's your share when the company exits" — financial commitments that execute automatically without anyone having to remember or chase
> 06 Salary streaming at the individual level — get paid every second rather than bi-weekly, with idle balances earning yield in the background until you spend them
> 07 Micro-insurance that turns on and off by the minute — cover your laptop for the next three hours, insure a specific journey, pay only for the moments of actual exposure
> 08 Savings products where your yield rate is gated by behavioural goals you set and your social graph verifies

**Linked resources:** docs.monad.xyz (getting started), developers.monad.xyz, hackathon.monad.xyz/resources

---

## 4. Official rules — selected sections

**Source:** "View the rules" modal on https://hackathon.monad.xyz/dashboard ("Metropolis Hackathon Rules & Guidelines — Terms & Conditions")
> LAST UPDATED 3 September 2026
> HACKATHON PERIOD September 1, 2026 to November 3, 2026

### 4a. Entering multiple sponsor bounties

The rules do not say directly whether one project can enter more than one sponsor bounty. What they do say:

From **Tracks & Bounties** (https://hackathon.monad.xyz/tracks):
> Choose one primary track, then add as many sponsor bounties as you'd like. Each bounty lists what it needs. You complete those fields when you submit.

> Sponsor bounties — Optional awards. Each one names its track, and the ones marked All tracks pair with any.

From the rules, **2.5 Multiple Submissions**:
> Participants are only allowed to submit one project. Multiple submissions are not allowed.
> Each submission must compete in only one track
> Participants cannot win multiple main track prizes for the same project

From the rules, **3.2** (Additional Bounties):
> Sponsor-funded bounties may be added and announced during the Hackathon period, each with their own terms and requirements.

From the rules, **3.3**:
> For Sponsor bounties: the submission must meet the requirements published by the relevant Sponsor for that bounty

**[Note]** The Agora payments bounty is tied to the Consumer Products & Payments track. Both Mera bounties are "All tracks." So the Tracks page allows one Consumer track project to enter all three.

### 4b. Team size — 2.4 Team Participation
> Teams may consist of 1-5 members
> Each team must register for the Hackathon through the Hackathon website
> All team members must meet eligibility requirements
> One team member must be designated as the primary contact
> Prize money will be paid to the designated contact, who is responsible for distribution

Also on the Tracks page:
> A project unlocks tracks and bounties, and the team holds it. A team of one is a team.

### 4c. Submission requirements — 4.1 Mandatory Requirements
> All submissions must include:
>
> 1. Public GitHub Repository containing:
> Complete source code;
> README with setup instructions;
> Open source license (MIT, Apache 2.0, GPL, or similar);
> Clear attribution of external code/libraries used; and
> A commit history covering the build window.
>
> 2. Demo Video (3 minutes):
> Publicly accessible (YouTube, Loom, Vimeo, etc.);
> Clearly demonstrates the product in actual operation; and
> Shows Monad blockchain integration.
>
> 3. Monad Integration:
> Clear explanation of how the project leverages Monad;
> Contract addresses (if applicable); and
> Deployment to Monad mainnet or testnet.
>
> 4. Originality and Build Window:
> The substantial majority of the work submitted must be created during the Hackathon period;
> Pre-existing code or products may be used as a foundation only if the pre-existing components are identified in the README and the submission adds substantial new functionality built during the Hackathon period; and
> Use of AI coding tools is permitted and must be disclosed in the README.
>
> 5. Documentation:
> Project description
> Architecture overview
> Technology stack
> Setup/deployment instructions
>
> 6. Submission Platform: all submissions must be made through the Hackathon website. Use of the Hackathon website is subject to its own terms of use and privacy policy, which apply in addition to these Terms.

**9.4 Demo Video Requirements**
> Demo videos must:
> Be no more than 3 minutes in length
> Be publicly accessible via YouTube, Loom, Vimeo, or similar
> Show the product in actual operation (not mockups or slides)
> Show Monad blockchain interactions

**9.1 Product Requirements**
> Projects must demonstrate a working implementation:
> A functioning prototype, not a mockup, design file, or concept deck
> Code a third party can run by following the README
> A clear statement of the problem the product solves and the intended user
> Evidence of the product operating in the demo video

**9.2 Monad Integration Requirements**
> All projects must:
> Provide contract addresses or transaction hashes
> Use Monad mainnet or testnet
> Clearly document blockchain integration purpose
> Demonstrate why Monad's capabilities are utilized

**Write-up:** The rules have no separate "write-up" item. The closest items are the README/Documentation requirements above. The Consumer track page also asks for a Pitch Video (max 2 minutes), a logo, and a Live Product Link (see Section 3).

### 4d. Deadline and timezone — 4.2 Submission Deadline
> Final Deadline: October 13, 2026, 11:59 PM ET
>
> Submissions accepted on rolling basis starting September 1, 2026
> Late submissions will not be accepted
> Submission timestamp determined by the time recorded by the Hackathon website
> A submission may be edited until the deadline. The version recorded at the deadline is the version judged.

How other pages show the same deadline:
- Dashboard: "Submissions Open — Opens 1 Oct · Closes 13 Oct, 23:59 EDT"
- Track page / Agora bounty: "Oct 13, 2026 at 23:59 EDT"
- Mera bounties: "Oct 14, 2026 at 03:59 UTC" (same time)

**[Note]** The rules say submissions are accepted "starting September 1, 2026." The dashboard says the submission form "Opens 1 Oct."

### 4e. Judging criteria in the rules — 5.2 (for reference)
> All Tracks:
> Product Quality & Completeness (20%)
> Technical Excellence (20%)
> Monad Integration (20%)
> Track Fit & Problem Relevance (20%)
> Innovation & Impact (20%)
>
> Sponsor Bounties:
> Adherence to the published bounty requirements (40%)
> Technical Implementation (30%)
> Monad Integration (20%)
> Innovation (10%)

**[Note]** These general track weights don't match the weights on the Consumer track page (20/20/15/25/20). I don't know the exact answer to which one judges will use.

---

## 5. Milestones and check-ins before the final deadline

**Sources:** https://hackathon.monad.xyz/dashboard, https://hackathon.monad.xyz/calendar

Dashboard timeline (verbatim):
> REGISTRATION · Open through 6 Oct
> Build — 1 Sep to 13 Oct
> Submissions Open — Opens 1 Oct · Closes 13 Oct, 23:59 EDT
> Judging — 13 Oct to 3 Nov
> Winners — From 4 Nov

Rules 5.1 (verbatim):
> Judging Period: submissions are reviewed between October 14 and October 27, 2026
> Winner Announcement: Winners announced on November 3, 2026

**Check-ins or intermediate deliverables:** Not found. The calendar describes itself as covering "Online workshops, IRL events, due dates, and office hours." The support FAQ also says the calendar shows "submission milestones." But no due dates or check-ins are listed. Upcoming calendar entries (EDT) are only:
- Fri 25 Sep — Metropolis Hacker House: SF, 14:00
- Sat 26 Sep — Metropolis Hacker House: Shenzhen, 01:30; Buenos Aires, 09:00
- Fri 2 Oct — Metropolis Hacker House: London, 05:00
- Tue 6 Oct — Open, 09:00
> Programming is added as it is confirmed.

**Related past event:** Fri 11 Sep workshops included "Building Payments & Trading Apps with Agora on Monad" and "mera: crypto accounts made simple." Both are marked "NOT RECORDED" on the calendar.

**[Note]** The dashboard and rules give different judging and winner dates (dashboard: Judging 13 Oct–3 Nov, winners from 4 Nov; rules: judging 14–27 Oct, winners 3 Nov).

---

## 6. Links: Mera docs, AUSD faucet, AUSD contract address

| Item | Status | Where found |
|---|---|---|
| Mera docs | Found: https://mera.category.xyz/getting-started/ (plus /reference/, /concepts/passkeys-and-prf/, /concepts/secret-vaults/, /recipes/use-mera-with-react-native/, /recipes/use-mera-with-chrome-extensions/, /recipes/use-an-existing-secret/) | Mera bounty pages |
| Mera GitHub | Found: https://github.com/category-labs/mera | Best Mera-Powered UX bounty page |
| "MERA" entry on Resources page | https://docs.monad.xyz/guides/mera, described as "Monad execution and runtime architecture guide." **[Note]** That description doesn't match the passkey-account Mera from the bounties. I haven't opened the link. | https://hackathon.monad.xyz/resources |
| Agora AUSD testnet faucet | Found: `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`. Call `requestFunds(address receiver)` — permissionless, so teammates and judges can fund themselves. **$10,000 AUSD per call, 60-second cooldown, refuses above a $100,000 balance** (`MaxAmountToOwn`). Transparent proxy; logic at `0xba804DF5c476E8EaeF87BF8085F295300ccE2a49`. Read off the live contract 10 Oct 2026, not from docs. | https://docs.agora.finance/developer/contract-deployments |
| AUSD testnet contract address on Monad | Found: `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`. Verified on-chain: `name()`/`symbol()` = "AUSD", `decimals()` = **6**, which is what the UI assumes. The faucet's `token()` returns this same address. Wired as `AUSD_TESTNET` in `sdk/src/config.ts`. | https://docs.agora.finance/developer/contract-deployments |
| Testnet MON faucet (not AUSD) | https://faucet.monad.xyz/ | Dashboard, Mera UX bounty page |
