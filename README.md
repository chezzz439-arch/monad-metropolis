# Monad Metropolis Hackathon

Team project for the Monad Metropolis hackathon (Consumer Products & Payments track).

- Submission deadline: October 13, 2026, 11:59 PM ET
- Concept (Chit Circle): [docs/concept.md](docs/concept.md)
- Hackathon brief (bounties, rules, deadlines): [docs/metropolis_hackathon_brief.md](docs/metropolis_hackathon_brief.md)

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

## License

[MIT](LICENSE)
