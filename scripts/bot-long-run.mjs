#!/usr/bin/env node

/**
 * BOT-002 proof: long-run four-player Commander game on the real
 * Forge/Manabrew stack - one capture-driven human seat plus three
 * self-hosted-node bots, all playing the real playgroup deck
 * (decks/dina-sacrifice.txt).
 *
 * Success criteria (ticket BOT-002):
 * - game reaches the configured number of turns (BOT_RUN_TARGET_TURNS, default 8)
 * - no relay/engine errors and no uncontrolled prompt loops
 * - every prompt for our seat is answered or explicitly reported as unsupported
 * - no stall longer than BOT_RUN_STALL_MS (deadlock watchdog)
 * - forge-room container memory is sampled; no uncontrolled growth
 *
 * Env overrides:
 *   MANABREW_RELAY_URL / MANABREW_SERVER_KEY / MANABREW_ROOM_NAME / MANABREW_ROOM_PASSWORD
 *   DECK_FILE / DECK_OWNER / DECK_NAME / DECK_COMMANDER
 *   BOT_RUN_TARGET_TURNS (default 8), BOT_RUN_TIMEOUT_MS (default 900000),
 *   BOT_RUN_STALL_MS (default 180000), BOT_RUN_CONTAINER (docker stats target),
 *   BOT_RUN_CAST_PATTERN (optional regex source; matching chooseAction labels
 *   are cast instead of only playing lands)
 */

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { ManabrewRelayClient } from "@mtg-commander/manabrew-client";
import {
  importCommanderDeck,
  toManabrewDeckSelection,
} from "../packages/shared/dist/deck-list.js";

const execFileAsync = promisify(execFile);

const relayUrl = process.env.MANABREW_RELAY_URL ?? "ws://localhost:9443";
const serverKey = process.env.MANABREW_SERVER_KEY ?? "local-dev-change-me";
const roomName = process.env.MANABREW_ROOM_NAME ?? "MTG-Commander PoC";
const roomPassword = process.env.MANABREW_ROOM_PASSWORD ?? "local-dev";
const deckFile = process.env.DECK_FILE ?? "decks/dina-sacrifice.txt";
const deckOwner = process.env.DECK_OWNER ?? "Korbi";
const deckName = process.env.DECK_NAME ?? "Dina Sacrifice";
const commanderName = process.env.DECK_COMMANDER ?? "Dina, Essence Brewer";
const targetTurns = Number(process.env.BOT_RUN_TARGET_TURNS ?? 8);
const timeoutMs = Number(process.env.BOT_RUN_TIMEOUT_MS ?? 900_000);
const stallMs = Number(process.env.BOT_RUN_STALL_MS ?? 180_000);
const containerName = process.env.BOT_RUN_CONTAINER ?? "manabrew-forge-room-forge-room-1";
const castPatternSource = process.env.BOT_RUN_CAST_PATTERN ?? null;
const castPattern = castPatternSource ? new RegExp(castPatternSource, "i") : null;
const memorySampleIntervalMs = Number(process.env.BOT_RUN_MEMORY_INTERVAL_MS ?? 60_000);
const graceMs = Number(process.env.BOT_RUN_GRACE_MS ?? 0);
const roomWaitMs = Number(process.env.BOT_RUN_ROOM_WAIT_MS ?? 60_000);

const username = `bot-longrun-${Date.now()}`;
const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
const capturePath = path.join("captures", `bot-long-run-${startedAt}.jsonl`);
const summaryPath = path.join("captures", `bot-long-run-${startedAt}.summary.json`);

const summary = {
  proof: "BOT-002",
  config: {
    relayUrl,
    roomName,
    username,
    deckFile,
    deckName,
    commanderName,
    targetTurns,
    timeoutMs,
    stallMs,
    containerName,
    castPattern: castPatternSource,
  },
  startedAt,
  capturePath,
  import: null,
  game: { roomId: null, gameId: null, playerOrder: null, mySlot: null, startedAt: null },
  progress: {
    maxTurn: 0,
    lastStep: null,
    lastActivePlayerId: null,
    statesSeen: 0,
    promptEnvelopes: 0,
    answersSent: 0,
    promptTypeCounts: {},
    turnHistory: [],
  },
  unsupportedPrompts: [],
  errors: [],
  memorySamples: [],
  result: null,
  reason: null,
};

fs.mkdirSync("captures", { recursive: true });

let client;
let done = false;
let mySlot = null;
const answeredPromptIds = new Set();
let payManaPromptCount = 0;
let botSpawnRequested = false;
let deckSelectionRequested = false;
let readyRequested = false;
let gameStartedSeen = false;
let sentStart = false;
let lastActivityAt = Date.now();
let turnsReachedAt = null;
let roomListWaitStartedAt = null;

function record(direction, message) {
  const recordedMessage =
    direction === "out" && message?.type === "Authenticate"
      ? { ...message, password: "[redacted]" }
      : message;
  fs.appendFileSync(
    capturePath,
    `${JSON.stringify({
      at: new Date().toISOString(),
      direction,
      type: recordedMessage?.type ?? recordedMessage?.kind ?? "unknown",
      message: recordedMessage,
    })}\n`,
  );
}

function note(event, data = {}) {
  console.log(`[bot-longrun] ${event}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ""}`);
  if (event === "turn-progress") {
    summary.progress.turnHistory.push({ at: new Date().toISOString(), ...data });
  }
}

function finish(result, reason) {
  if (done) return;
  done = true;
  summary.result = result;
  summary.reason = reason;
  summary.finishedAt = new Date().toISOString();
  summary.progress.lastActivityAt = new Date(lastActivityAt).toISOString();
  try {
    client?.close();
  } catch {}
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[bot-longrun] ${result}: ${reason}`);
  console.log(`[bot-longrun] summary -> ${summaryPath}`);
  process.exit(result === "ok" ? 0 : 1);
}

async function sampleMemory() {
  try {
    const { stdout } = await execFileAsync("docker", [
      "stats",
      "--no-stream",
      "--format",
      "{{.Name}} {{.MemUsage}} {{.CPUPerc}}",
      containerName,
    ]);
    const line = stdout.trim();
    if (line) summary.memorySamples.push({ at: new Date().toISOString(), stats: line });
  } catch (error) {
    if (summary.memorySamples.length === 0) {
      summary.memorySamples.push({
        at: new Date().toISOString(),
        error: String(error?.message ?? error),
      });
    }
  }
}

// --- deck import (same proven path as DECK-002) -------------------------------

const deckText = fs.readFileSync(path.resolve(deckFile), "utf8");
const imported = importCommanderDeck(deckText, {
  owner: deckOwner,
  name: deckName,
  commanderNames: [commanderName],
  sourceUrl: null,
  importedAt: new Date().toISOString(),
});
if (!imported.ok) {
  console.error("[bot-longrun] deck import failed:", JSON.stringify(imported.issues));
  process.exit(1);
}
const deck = imported.deck;
const totalCards =
  deck.commanders.length + deck.cards.reduce((sum, entry) => sum + entry.quantity, 0);
summary.import = {
  ok: true,
  deckFile,
  commander: deck.commanders[0]?.name ?? null,
  uniqueCards: deck.cards.length,
  totalCards,
};

const mySelection = toManabrewDeckSelection(deck);
const botSelections = Array.from({ length: 3 }, (_, index) => ({
  deckName: `${deckName} Bot ${index + 1}`,
  deck: mySelection.deck,
  commanderName: deck.commanders[0]?.name ?? commanderName,
}));

// --- prompt policy (proven families from capture-real-session) ----------------

function response(fromPlayer, promptId, action) {
  return { fromPlayer, promptId, actionType: action.type, output: action.output };
}

function promptResponse(forPlayer, prompt) {
  const input = prompt?.input ?? {};
  const promptId = prompt?.promptId ?? prompt?.prompt_id;
  const type = input?.type;
  if (typeof promptId !== "number") return null;

  if (type === "mulligan") {
    return response(forPlayer, promptId, {
      type: "mulligan",
      output: { type: "mulliganDecision", keep: true },
    });
  }

  if (type === "mulliganPutBack") {
    const cardIds = Array.isArray(input.handCardIds)
      ? input.handCardIds.slice(0, input.count ?? 0)
      : [];
    return response(forPlayer, promptId, {
      type: "mulliganPutBack",
      output: { type: "mulliganPutBackDecision", cardIds },
    });
  }

  if (type === "chooseAction") {
    const actions = Array.isArray(input.actions) ? input.actions : [];
    const land =
      actions.find((action) => action.type === "playLand") ??
      actions.find((action) => /^Play\s/i.test(action.label ?? ""));
    const cast = castPattern
      ? actions.find((action) => castPattern.test(action.label ?? ""))
      : null;
    const chosen = cast ?? land ?? null;
    return response(forPlayer, promptId, {
      type: "chooseAction",
      output: chosen
        ? { type: "act", actionId: chosen.id }
        : { type: "pass", exhaustStack: false },
    });
  }

  if (type === "payManaCost") {
    const manaAction = Array.isArray(input.actions) ? input.actions[0] : null;
    return response(forPlayer, promptId, {
      type: "payManaCost",
      output: input.canConfirmFromPool
        ? { type: "pay", auto: false }
        : manaAction
          ? { type: "act", actionId: manaAction.id }
          : { type: "cancel" },
    });
  }

  if (type === "chooseBoardTargets") {
    const candidates = Array.isArray(input.candidates) ? input.candidates : [];
    const chosen =
      candidates.find((candidate) => candidate.kind === "player" && candidate.id !== mySlot) ??
      candidates[0];
    if (!chosen && input.cancellable) {
      return response(forPlayer, promptId, {
        type: "chooseBoardTargets",
        output: { type: "cancel" },
      });
    }
    if (!chosen) return null;
    return response(forPlayer, promptId, {
      type: "chooseBoardTargets",
      output: { type: "boardTargets", chosen: [chosen] },
    });
  }

  if (type === "diceRolled") {
    return response(forPlayer, promptId, {
      type: "diceRolled",
      output: { type: "diceRolledAcknowledged" },
    });
  }

  // additional prompt families proven against manabrew-rs protocol commit 3586834
  // (crates/manabrew-protocol/src/prompts/*.rs, serde tag="type" + camelCase)
  if (type === "revealCards") {
    return response(forPlayer, promptId, {
      type: "revealCards",
      output: { type: "revealCardsAcknowledged" },
    });
  }

  if (type === "chooseBoolean") {
    return response(forPlayer, promptId, {
      type: "chooseBoolean",
      output: { type: "decision", value: true },
    });
  }

  if (type === "scry") {
    const cards = Array.isArray(input.cards) ? input.cards : [];
    const zones = Array.isArray(input.zones) ? input.zones : ["libraryTop"];
    const zoneCardIds = zones.map((_, index) =>
      index === 0 ? cards.map((card) => card.id) : [],
    );
    return response(forPlayer, promptId, {
      type: "scry",
      output: { type: "scryDecision", zoneCardIds },
    });
  }

  if (type === "reorder") {
    const items = Array.isArray(input.items) ? input.items : [];
    return response(forPlayer, promptId, {
      type: "reorder",
      output: { type: "reorderDecision", orderedIds: items.map((item) => item.id) },
    });
  }

  if (type === "chooseCards") {
    const cards = Array.isArray(input.cards) ? input.cards : [];
    const min = Number.isFinite(input.min) ? input.min : 0;
    return response(forPlayer, promptId, {
      type: "chooseCards",
      output: {
        type: "chooseCardsDecision",
        chosenCardIds: cards.slice(0, Math.max(min, 0)).map((card) => card.id),
      },
    });
  }

  return null;
}

// --- game state + prompt handling ----------------------------------------------

function trackProgress(gameView) {
  if (!gameView) return;
  const turn = gameView.turn ?? gameView.turnNumber ?? null;
  const step = gameView.step ?? null;
  summary.progress.lastStep = step ?? summary.progress.lastStep;
  summary.progress.lastActivePlayerId =
    gameView.activePlayerId ?? summary.progress.lastActivePlayerId;
  if (typeof turn === "number" && turn > summary.progress.maxTurn) {
    summary.progress.maxTurn = turn;
    note("turn-progress", {
      turn,
      step,
      activePlayerId: gameView.activePlayerId ?? null,
      stackDepth: gameView.stack?.length ?? 0,
    });
    if (summary.progress.maxTurn >= targetTurns && turnsReachedAt === null) {
      turnsReachedAt = Date.now();
      note("target-turns-reached", { targetTurns, graceMs });
    }
  }
}

function handleStateEnvelope(serverMessage) {
  const envelope = serverMessage.state;
  if (!envelope || typeof envelope !== "object") return;

  if (envelope.kind === "state") {
    summary.progress.statesSeen += 1;
    const gameView = envelope.state?.gameView ?? null;
    if (envelope.forPlayer === mySlot) trackProgress(gameView);
    return;
  }

  if (envelope.kind === "stateDelta") {
    summary.progress.statesSeen += 1;
    return;
  }

  if (envelope.kind === "prompt") {
    summary.progress.promptEnvelopes += 1;
    const inputType = envelope.prompt?.input?.type ?? "unknown";
    summary.progress.promptTypeCounts[inputType] =
      (summary.progress.promptTypeCounts[inputType] ?? 0) + 1;

    if (inputType === "payManaCost") {
      payManaPromptCount += 1;
      if (payManaPromptCount > 25) {
        summary.errors.push({ type: "promptLoopGuard", inputType, count: payManaPromptCount });
        finish("failed", "paymana-prompt-loop");
        return;
      }
    }

    if (!mySlot || envelope.forPlayer !== mySlot) return;
    const promptId = envelope.prompt?.promptId ?? envelope.prompt?.prompt_id;
    if (typeof promptId === "number" && answeredPromptIds.has(promptId)) return;

    const outbound = promptResponse(envelope.forPlayer, envelope.prompt);
    if (outbound) {
      answeredPromptIds.add(promptId);
      summary.progress.answersSent += 1;
      const outputTypeKey = outbound.output?.type ?? "unknown";
      summary.progress.answersByOutputType ??= {};
      summary.progress.answersByOutputType[outputTypeKey] =
        (summary.progress.answersByOutputType[outputTypeKey] ?? 0) + 1;
      note("answering-prompt", { inputType, promptId, outputType: outbound.output?.type });
      client.respond(outbound);
    } else {
      const detail = {
        at: new Date().toISOString(),
        promptId: promptId ?? null,
        inputType,
        inputKeys: Object.keys(envelope.prompt?.input ?? {}),
        cancellable: Boolean(envelope.prompt?.input?.cancellable),
      };
      summary.unsupportedPrompts.push(detail);
      note("unsupported-prompt", detail);
    }
    return;
  }

  if (envelope.kind === "error" || envelope.kind === "fatal") {
    summary.errors.push(envelope);
    finish("failed", "engine-error");
  }
}

function maybeStart(room) {
  if (sentStart || room.status !== "Lobby") return;
  if (room.players.length < 4) return;
  if (
    !room.players.every(
      (player) => player.connected && player.ready && player.selected_deck_name,
    )
  ) {
    return;
  }
  sentStart = true;
  note("starting-game", { players: room.players.map((player) => player.username) });
  client.startGame("Commander");
}

async function main() {
  note("connecting", { relayUrl, targetTurns });
  await sampleMemory();

  client = new ManabrewRelayClient({
    url: relayUrl,
    username,
    password: serverKey,
    clientPlatform: "unknown",
    clientVersion: "0.1.0",
    reconnect: true,
    reconnectMinDelayMs: 250,
    reconnectMaxDelayMs: 2_000,
    reconnectMaxAttempts: 3,
  });

  client.on("send", (message) => record("out", message));
  client.on("message", (message) => {
    record("in", message);
    if (message.type === "AuthResult") {
      if (!message.success) {
        summary.errors.push(message);
        finish("failed", "auth-failed");
        return;
      }
      note("authenticated");
      client.listRooms();
      return;
    }

    if (message.type === "RoomList") {
      const candidates = message.rooms.filter((candidate) => candidate.room_name === roomName);
      if (candidates.length === 0) {
        // right after a container restart the room may take seconds to appear
        if (roomListWaitStartedAt === null) roomListWaitStartedAt = Date.now();
        if (Date.now() - roomListWaitStartedAt < roomWaitMs) {
          note("waiting-for-room", { roomName, seen: message.rooms.length });
          setTimeout(() => client.listRooms(), 3_000);
          return;
        }
        summary.errors.push({ message: `Room not found: ${roomName}` });
        finish("failed", "room-not-found");
        return;
      }
      // multiple rooms can share the name after node restarts; prefer a free lobby
      const room = candidates.find((candidate) => candidate.status === "Lobby");
      if (!room) {
        summary.errors.push({
          message: `All rooms named ${roomName} are in game`,
          candidates: candidates.map((candidate) => ({
            room_id: candidate.room_id,
            status: candidate.status,
          })),
        });
        finish("failed", "game-already-started-restart-forge-room");
        return;
      }
      summary.game.roomId = room.room_id;
      note("joining-room", { roomId: room.room_id, players: room.players?.length ?? 0 });
      client.joinRoom({ roomId: room.room_id, password: roomPassword });
      return;
    }

    if (message.type === "RoomUpdate") {
      lastActivityAt = Date.now();
      const room = message.room;
      if (room?.room_id) summary.game.roomId = room.room_id;

      const botCount = room.players.filter((player) => player.is_bot).length;
      const hasMe = room.players.some((player) => player.username === username);
      if (hasMe && botCount < 3 && room.status === "Lobby" && !botSpawnRequested) {
        botSpawnRequested = true;
        note("spawning-bots", { requested: 3 - botCount, deck: deckName });
        client.spawnBots({ roomId: room.room_id, decks: botSelections });
      }
      const me = room.players.find((player) => player.username === username);
      if (me && !me.selected_deck_name && !deckSelectionRequested) {
        deckSelectionRequested = true;
        note("selecting-deck", { deckName });
        client.setDeckSelection(mySelection);
      }
      if (me && !me.ready && !readyRequested && me.selected_deck_name) {
        readyRequested = true;
        note("setting-ready");
        client.setReady(true);
      }
      maybeStart(room);
      return;
    }

    if (message.type === "GameStarted") {
      if (gameStartedSeen) return;
      gameStartedSeen = true;
      lastActivityAt = Date.now();
      summary.game.gameId = message.game_id;
      summary.game.playerOrder = message.player_order;
      summary.game.startedAt = new Date().toISOString();
      const slotIndex = message.player_order.findIndex((player) => player === username);
      mySlot = slotIndex >= 0 ? `player-${slotIndex}` : null;
      summary.game.mySlot = mySlot;
      note("game-started", { gameId: message.game_id, mySlot });
      client.requestResync();
      return;
    }

    if (message.type === "GameEnded" || message.type === "GameOver") {
      note("game-ended");
      finish(
        summary.progress.maxTurn >= targetTurns ? "ok" : "failed",
        `game-ended-at-turn-${summary.progress.maxTurn}`,
      );
      return;
    }

    if (message.type === "StateUpdate" || message.type === "BroadcastState") {
      lastActivityAt = Date.now();
      handleStateEnvelope(message);
      return;
    }

    if (message.type === "Error") {
      summary.errors.push(message);
      note("relay-error", { code: message.code, message: message.message });
      if (message.code === "game_already_started") {
        finish("failed", "game-already-started-restart-forge-room");
      }
    }
  });

  client.on("invalidMessage", ({ raw, error }) => {
    record("in", { type: "unparsed", raw });
    summary.errors.push({ type: "invalid-message", message: String(error?.message ?? error) });
  });
  client.on("error", (error) => {
    summary.errors.push({ type: "websocket-error", message: String(error?.message ?? error) });
  });
  client.on("reconnectScheduled", ({ attempt, delayMs }) => {
    note("reconnect-scheduled", { attempt, delayMs });
  });
  client.on("status", ({ status }) => {
    if (status === "failed" && !done) finish("failed", "reconnect-exhausted");
  });

  client.connect();

  const runStartedAt = Date.now();
  let nextMemorySampleAt = Date.now() + memorySampleIntervalMs;
  while (!done) {
    await delay(1_000);
    if (Date.now() - runStartedAt > timeoutMs) {
      finish("failed", `timeout-at-turn-${summary.progress.maxTurn}`);
      return;
    }
    if (turnsReachedAt !== null && Date.now() - turnsReachedAt > graceMs) {
      finish("ok", "turns-reached");
      return;
    }
    if (Date.now() - lastActivityAt > stallMs) {
      finish("failed", `stall-detected-at-turn-${summary.progress.maxTurn}`);
      return;
    }
    if (Date.now() >= nextMemorySampleAt) {
      nextMemorySampleAt = Date.now() + memorySampleIntervalMs;
      await sampleMemory();
    }
  }
}

await main();

