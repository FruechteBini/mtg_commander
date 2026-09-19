# Real Engine PoC: Self-hosted Manabrew Forge Room

## Goal

Run a real Manabrew Forge-backed room and use it as the next source of real protocol messages for MTG-Commander.

Local status on this machine:

- `node` works.
- `git` works.
- Docker Desktop works with WSL2.
- Docker CLI works via `C:\Program Files\Docker\Docker\resources\bin\docker.exe`.
- `docker compose` works.
- `npm`, `yarn`, and `corepack` are not available in PATH.

The real Forge-room PoC has been started successfully on this Windows workspace. The same Compose setup is still intended to be portable to the Synology/NAS Docker environment.

A dependency-free capture client now connects directly to the local relay, joins the hosted room, selects a Commander deck, spawns three bots in one batch, starts a real four-player Forge-backed game, records raw relay traffic, passes empty priority prompts, and executes the first available action.

## Local verification: 2026-09-16

Docker setup required:

- Enable Windows Subsystem for Linux.
- Enable Virtual Machine Platform.
- Install/update the WSL2 kernel.
- Run `wsl --update`.
- Start Docker Desktop.

Verified Docker versions:

```text
Docker CLI: 29.8.0
Docker Compose: v5.5.1
WSL: 2.7.14.0
Kernel: 6.18.33.2-2
```

Run command:

```powershell
& 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' compose up -d
```

Health check:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:9444/health | Select-Object -ExpandProperty Content
```

Observed health response:

```json
{"connected_players":2,"rooms":1,"status":"ok","uptime_s":23}
```

Important log evidence:

- Relay listens on `ws://0.0.0.0:9443`.
- Health endpoint listens on `http://0.0.0.0:9444/health`.
- Forge backend initialized successfully.
- Lazy card database indexed `34968` card names from `33711` files.
- Room created: `MTG-Commander PoC`.
- Room format: Commander.
- Engine: Forge.
- Bot enabled: true.
- A bot joined and selected deck `Neheb, the Worthy` with `100` cards.

Local connection details:

```text
Relay WebSocket: ws://localhost:9443
Health endpoint: http://localhost:9444/health
Room name: MTG-Commander PoC
Room password: local-dev
```

## Why this route

Manabrew publishes two useful Docker images:

- `ghcr.io/witchesofthehill/manabrew-server:latest`: WebSocket relay for lobbies/game traffic.
- `ghcr.io/witchesofthehill/manabrew-node:latest`: headless self-hosted room node. With the `forge` backend, it runs games on Forge instead of the Rust port.

This matches our architecture:

- server-side engine
- private room
- Commander format
- room password/invite-code style access
- NAS-friendly deployment

## Files

- `infra/manabrew-forge-room/compose.yml`
- `infra/manabrew-forge-room/.env.example`
- `scripts/capture-real-session.mjs`
- `captures/manabrew-real-session-2026-09-16T13-47-26-060Z.jsonl`
- `captures/manabrew-real-session-2026-09-16T13-47-26-060Z.summary.json`

## Runbook for Synology/NAS or local Docker

1. Copy `infra/manabrew-forge-room` to the NAS.
2. Copy `.env.example` to `.env`.
3. Change for non-local use:
   - `MANABREW_SERVER_KEY`
   - `SELF_HOSTED_NODE_ROOM_PASSWORD`
   - optionally `SELF_HOSTED_NODE_ROOM_NAME`
4. Start the stack:

```sh
docker compose up -d
```

5. Check relay health:

```sh
curl http://localhost:9444/health
```

6. Open Manabrew web or desktop client.
7. Point it at the relay:

```text
ws://localhost:9443
# or, on NAS:
# ws://<nas-hostname-or-ip>:9443
```

8. Join the room named by `SELF_HOSTED_NODE_ROOM_NAME`.

## What to capture next

The room is reachable locally, and the first real protocol loop has been captured:

- Authenticated to `ws://localhost:9443`.
- Joined room `MTG-Commander PoC`.
- Selected a test Commander deck.
- Started game `562acb10-b4ae-4e1b-8634-f09542cbe933`.
- Received a real `StateUpdate` whose inner envelope is `kind: "state"` with a `gameView`.
- Received a real `prompt` for `player-0` with `input.type: "diceRolled"`.
- Sent a valid `diceRolledAcknowledged` response.

Run command:

```powershell
node scripts\capture-real-session.mjs
```

Important protocol details learned:

- Relay messages use outer `type` names such as `Authenticate`, `JoinRoom`, `RoomUpdate`, `StartGame`, `GameStarted`, `StateUpdate`, and `BroadcastState`.
- Engine protocol messages are nested inside `StateUpdate.state` or `BroadcastState.state` and use inner `kind` names such as `state`, `prompt`, and `response`.
- `SetDeckSelection.deck.format` expects `commander`.
- `StartGame.format` expects `Commander`.

The 2026-09-17 capture `manabrew-real-session-2026-09-17T12-59-23-759Z` additionally proved:

1. One human and three self-hosted-node bots joined and became ready.
2. Forge started a four-player Commander game.
3. The client acknowledged `diceRolled`, kept its mulligan hand, passed priority, and played a Mountain.
4. A later `chooseAction` offered `Cast Shock`; the client sent its advertised action ID.
5. `chooseBoardTargets` advertised valid `TargetRef` values; the client selected opponent `player-1`.
6. The first `payManaCost` advertised the Mountain mana ability; the client activated it by action ID.
7. The next `payManaCost` reported `canConfirmFromPool: true`; the client confirmed with `pay(auto: false)`.
8. The client passed priority and waited for resolution.
9. The same `player-0` perspective showed `Shock` in `graveyard`, an empty stack, and `player-1` at 38 instead of 40 life.
10. The engine returned no error.

The captured messages have now been converted into the protocol-v5 TypeScript contract, runtime parser, and sanitized regression fixture under `packages/shared`. `node scripts/protocol-contract-test.mjs` validates the fixture and, when present, streams all messages from the ignored local raw capture. Additional prompt families can now be proven with focused fixtures.

## Open issue / next step

The custom capture client can drive the real relay, so the own-client strategy is still viable. The bot-count issue is resolved:

- Manabrew accepts multiple requested bot decks in one `spawnBot` payload.
- Every separate `spawnBot` request replaces the existing bot set; this was why the former three-request loop produced only one bot.
- One self-hosted node successfully supplied all three bot seats in the real capture.
- The capture now waits for all four ready seats before sending `StartGame`.

The multi-prompt spell proof and `PROTO-005` DTO/parser alignment are complete. The next engineering step is `ARCH-001`: define the process, reconnect, secret, deployment, and license boundary before extracting the reusable engine client.
