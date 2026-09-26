# Manabrew Protocol PoC

## Goal

Prove whether MTG-Commander can build its own UI against the Manabrew protocol instead of forking the Manabrew client first.

The first proof is intentionally small:

1. Accept a full `state` message containing `gameView`.
2. Store that authoritative state client-side.
3. Accept a `chooseAction` prompt.
4. Derive UI highlights from `input.actions`.
5. Return a valid `response` for either `act` or `pass`.

If this loop is enough to render a board and send legal actions, the "own UI over Manabrew protocol" route stays viable.

## What the protocol gives us

From Manabrew's protocol docs:

- Engine and client are separate.
- The wire format is transport-agnostic JSON.
- Engine to client messages include:
  - `state`: full authoritative `gameView`.
  - `stateDelta`: optional patch over the last state.
  - `prompt`: a decision request for one player.
  - `error`: rejected response.
- Client to engine messages include:
  - `response`: answer to a prompt, echoing `promptId`.
  - `directive`: out-of-band command such as concede.
- `chooseAction` contains legal actions and expects either:
  - `{ type: "act", actionId }`
  - `{ type: "pass", exhaustStack, until? }`
  - `{ type: "restoreSnapshot", checkpointId }`

## Early read

This is promising for our plan.

The protocol is explicitly designed so independent clients can drive compatible engines. The reference implementation is AGPL, but the protocol docs are CC-BY-4.0 and invite independent implementations. That supports the strategy: implement our own UI using the protocol boundary first, only fork Manabrew if this boundary turns out too weak.

## PoC artifacts in this repo

- `packages/shared/src/manabrew-protocol.ts`: observed protocol-v5 TypeScript contracts for relay and engine layers.
- `packages/shared/src/manabrew-protocol-parser.mjs`: dependency-free runtime validation at the external-message boundary.
- `packages/shared/fixtures/protocol-session.json`: sanitized real-shape Shock state/prompt/response/state regression fixture.
- `scripts/protocol-contract-test.mjs`: offline regression test; also validates the ignored raw capture when it exists locally.
- `scripts/protocol-poc.mjs`: dependency-free demo that parses the fixture and builds valid wrapped responses.
- `scripts/capture-real-session.mjs`: dependency-free WebSocket capture client for the local real Manabrew relay.
- `captures/manabrew-real-session-2026-09-17T12-59-23-759Z.summary.json`: latest clean real capture summary.

## Real capture result

The current real capture confirms that the self-hosted Manabrew relay can be driven by our own Node script:

- Authenticated to the relay.
- Joined the hosted Forge Commander room.
- Selected a Commander deck and became ready.
- Spawned three bots in one batch and started a four-player Commander game.
- Received a real `state` envelope containing `gameView`.
- Received and answered real `diceRolled`, `mulligan`, and repeated `chooseAction` prompts.
- Passed empty `chooseAction` prompts and played the required Mountain.
- Sent `act` with the engine-provided action ID for `Cast Shock`.
- Selected opponent `player-1` through `chooseBoardTargets` using the advertised `TargetRef`.
- Activated the Mountain through the advertised `payManaCost` action and confirmed the produced mana with `{ type: "pay", auto: false }`.
- Passed priority, then confirmed from the same `player-0` perspective that `Shock` moved from `hand` to `graveyard`, the stack was empty, and the target moved from 40 to 38 life.
- Completed the whole four-player run without a protocol or engine error.

This confirms the transport shape:

- Room/lobby traffic is wrapped by relay message `type`.
- Engine traffic is nested in `BroadcastState.state` / `StateUpdate.state`.
- Engine envelopes use `kind`.

## Bot architecture result

Manabrew's current self-hosted node supports multiple bots in one room. A single `spawnBot` room-relay payload carries both a compatibility `deck` and a `decks` array. The host starts up to `max_players - 1` bot tasks from that array.

The old capture script sent three separate `spawnBot` requests. Each request replaces the current bot set, so only the last bot survived. The script now sends one batch and waits for four ready players before starting.

Source inspection was performed against Manabrew commit `a0a490a7bdd3e03ff7f5c0b02198a726536aecfc` (`self-hosted-node/src/host.rs` and `src/game/hostedAiPlay.ts`).

## Mana payment result

When the mana pool can already pay the cost, the correct confirmation is `{ type: "pay", auto: false }`. Sending `auto: true` at that point restarts automatic payment and caused a prompt loop in the first attempt. The capture client now follows the same distinction as the Manabrew UI and stops after ten mana prompts if a future regression loops again.

## DTO and parser result

`PROTO-005` is complete. The contract now reflects the observed nesting instead of the earlier synthetic shape:

- Relay messages discriminate on `type`, including `RoomList`, `RoomUpdate`, `GameStarted`, `StateUpdate` and relay `Error`.
- `StateUpdate.state` contains engine envelopes discriminated on `kind`: `state`, `stateDelta`, `prompt`, `error` or `fatal`.
- Client answers are engine `response` envelopes wrapped in relay `BroadcastState` messages.
- The real `gameView` uses `turn`; there is no assumed `turnNumber`.
- Hidden/redacted zones are represented by their authoritative `count`; an empty `cards` array does not imply an empty zone.
- Unknown prompt families and extra fields remain preservable, while known message families receive structural runtime validation.

Run `node scripts/protocol-contract-test.mjs` for the dependency-free regression (`npm run protocol:test` is the package alias). On this machine the direct Node command validated seven sanitized fixture messages and all 228 messages from the successful local raw capture. That capture contained 130 full states and 28 prompts. It did not emit a real `stateDelta`, `error` or `fatal`, so those shapes remain contract-inventoried rather than capture-proven.

## Next proof

`ARCH-001` is complete in `docs/architecture.md`, and `APP-001` now provides the Web/API/shared workspace. The next engineering step is extracting the reusable server-side relay client in `ENGINE-001`. Remaining prompt families such as modes, multiple targets, trigger ordering, and combat stay as focused future regression fixtures.

Open questions:

- Does the Engine expose a save/snapshot primitive, or do we need to wrap it?
- How long can the simple built-in bots run a four-player Commander game reliably under realistic decks and board states?
