# Upstream-Issue-Entwurf: Spiel-Seed veroeffentlichen/steuern

Status: **Entwurf, noch nicht eingereicht** (vorbereitet 2026-09-26 als SAVE-002-Folgearbeit).
Ziel-Repository: `witchesofthehill/manabrew`, geprueft @ `35868343c77132714e43b6a227092658f956296a`.

## Vorschlag (Issue-Titel, englisch)

> **Publish and/or control the game seed for reproducible relay games**

## Issue-Text (englisch)

### Context

- The self-hosted node picks the seed for interactive relay games with `rand::random()` in `run_hosted_engine_game_inner` (`manabrew-rs/crates/self-hosted-node/src/engine_backend/java_backend.rs`) and never publishes it.
- `StartGameRequest` already carries a `seed` (default 42, `CountingRandom`; `forge-harness/src/main/java/forge/harness/host/ManaBrewEngineAdapter.java:356,84`), but nothing sets it for interactive relay games.
- `GameStarted` (`manabrew-rs/crates/manabrew-relay-protocol/src/lib.rs`) has no seed field, so clients cannot learn the seed even after the fact.
- Only self-play has a seed override today (`SELF_HOSTED_NODE_SELF_PLAY_SEED`).

### Why it matters

- **Reproducible games:** identical start condition + identical prompt responses still produce different shuffles across engine restarts, so no downstream replay/save/resume is possible today.
- **Debugging/parity:** reproducing a crash or a rules bug requires replaying the exact game.
- **Third-party clients** (we run a solo-play Commander client against three bots) can already journal every prompt response; the missing seed is the only remaining gap.

### Proposal (any one option unblocks downstream work)

1. **Publish:** add the chosen seed to `GameStarted` (and/or the room state) so clients can record it.
2. **Control:** let the game-starting client pass a seed through `StartGame`/room creation.
3. **Configure:** an env override for the interactive seed, mirroring `SELF_HOSTED_NODE_SELF_PLAY_SEED`.

Options 1+2 combined would additionally enable client-side replay verification.

### Notes

- Our replay journal is already implemented and waiting for this feature: `apps/api/src/game-journal.ts`, decision context in `docs/save-resume-research.md`.
