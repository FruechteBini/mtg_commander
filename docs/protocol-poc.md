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

- `packages/shared/src/manabrew-protocol.ts`: minimal TypeScript types for the first message loop.
- `packages/shared/fixtures/protocol-session.json`: fake state + `chooseAction` prompt for local testing.
- `scripts/protocol-poc.mjs`: dependency-free script that loads the fixture and builds valid responses.
- `scripts/capture-real-session.mjs`: dependency-free WebSocket capture client for the local real Manabrew relay.
- `captures/manabrew-real-session-2026-09-16T13-47-26-060Z.summary.json`: latest clean real capture summary.

## Real capture result

The first real capture confirms that the self-hosted Manabrew relay can be driven by our own Node script:

- Authenticated to the relay.
- Joined the hosted Forge Commander room.
- Selected a Commander deck and became ready.
- Started a game with the self-hosted-node bot.
- Received a real `state` envelope containing `gameView`.
- Received and answered a real `diceRolled` prompt.

This confirms the transport shape:

- Room/lobby traffic is wrapped by relay message `type`.
- Engine traffic is nested in `BroadcastState.state` / `StateUpdate.state`.
- Engine envelopes use `kind`.

## Next proof

After the real state/dice prompt capture, the next proof should go one interaction deeper:

1. Opening-hand or mulligan prompt.
2. First `chooseAction`.
3. One legal `act` response.
4. One `pass` response.

Open questions:

- Does the Engine expose a save/snapshot primitive, or do we need to wrap it?
- Does one self-hosted node support three bots in one room, or do we need multiple node services / custom bot clients?
