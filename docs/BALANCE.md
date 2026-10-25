# Balance: how spell and item numbers are decided

Part of the index in the root [CLAUDE.md](../CLAUDE.md). Commands and report details: [CONTRIBUTING.md](../CONTRIBUTING.md) and [scripts/CLAUDE.md](../scripts/CLAUDE.md).

- Numbers come from the simulator, not opinion: `node scripts/balance-sim.ts --minutes 30 --seed 1 --difficulty normal --out balance/<folder>` (several processes with different seeds; join them with `--merge`).
- The number that counts is the **gold-adjusted win rate** ("adjusted" column; 1.00 = wins its fair share). Accepted band: **0.85 to 1.15 on Normal and on Hard**. Fun targets in the report (rounds of 60 to 120 s, ≥ 60% of deaths by hit).
- When a number does not respond to changes, suspect the bot: with the Redirector, the cooldown changed nothing; the problem was the bot reacting perfectly.
- `build-tournament.ts` finds dominant purchase combinations; report them, do not adjust on your own.
- A balance change only goes in after being measured locally with enough data (tens of thousands of rounds per difficulty).
- Owner exceptions (changes accepted without the simulator) are recorded in [docs/DECISIONS.md](DECISIONS.md).
