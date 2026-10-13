# Screens

Captured at 390 × 844 (iPhone 14 class) at 2× from the real web build, with the
SDK's mock client supplying the data. Nothing here is a mockup — every screen is
the shipping component rendered through the shipping hooks.

To re-capture after a UI change:

```sh
npm run export:web
python3 -m http.server 8123 --directory dist &
# then, per screen:
chrome-headless-shell --headless --hide-scrollbars \
  --window-size=390,844 --force-device-scale-factor=2 --virtual-time-budget=9000 \
  --screenshot=docs/screenshots/05-home.png "http://0.0.0.0:8123/?screen=home"
```

Any screen can be opened in a browser with `?screen=<name>` — see
`app/gallery/Gallery.tsx` for the list. The parameter is inert on a normal
visit, so the gallery costs the real app nothing.

## The invite path

`02` → `04` → `09` is what someone who taps a shared link actually walks
through: they land already invited, set up an account, and come back to the
circle with one button on it. `08` is the other side of the same link — where
the organizer lands the moment they finish creating.

| File | `?screen=` | What it shows |
|---|---|---|
| `01-welcome.png` | `welcome` | First run. One promise, one button |
| `02-invited.png` | `welcome-invited` | Arrived on an invite link, signed out |
| `03-welcome-returning.png` | `welcome-returning` | Same screen for someone who already has an account |
| `04-setting-up.png` | `setup` | The pause after sign-up, while the account is made ready |
| `05-home.png` | `home` | Your circles, with the turn and the countdown on the card |
| `06-home-empty.png` | `home-empty` | Nothing joined yet |
| `07-create-circle.png` | `create` | Starting a circle, with the pot worked out in words |
| `08-invite-members.png` | `detail-filling` | Just created. Not full yet, so the only job is inviting |
| `09-join-circle.png` | `detail-join` | **The invited member's screen.** `Join for $100`, deposit explained |
| `10-circle-detail.png` | `detail` | Mid-round: pot, who gets it, `Pay $100` |
| `11-ready-to-settle.png` | `detail-settle` | Timer run out, pot full, `Settle round` |
| `12-missed-payment.png` | `missed` | **The demo's headline.** Someone missed; the deposit covered it |
| `13-success-payout.png` | `success` | `You received $500` with the settled-in timer |
| `14-success-with-missed.png` | `success-missed` | The same payout, when a member had defaulted |
| `15-send-money.png` | `send` | Member-to-member send — pick a face, pick an amount |
| `16-error-offline.png` | `home-error` | The network is down |
| `17-error-passkey.png` | `welcome-error` | A cancelled confirmation |
| `18-error-bad-link.png` | `welcome-bad-link` | An invite link that arrived truncated |
| `19-setup-failed.png` | `setup-failed` | Account setup did not finish |
