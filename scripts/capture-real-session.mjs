#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const relayUrl = process.env.MANABREW_RELAY_URL ?? "ws://localhost:9443";
const serverKey = process.env.MANABREW_SERVER_KEY ?? "local-dev-change-me";
const roomName = process.env.MANABREW_ROOM_NAME ?? "MTG-Commander PoC";
const roomPassword = process.env.MANABREW_ROOM_PASSWORD ?? "local-dev";
const minPlayersToStart = Number(process.env.MANABREW_CAPTURE_MIN_PLAYERS ?? 2);
const username = process.env.MANABREW_CAPTURE_USERNAME ?? `capture-player-${Date.now()}`;
const captureDir = path.resolve("captures");
const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
const capturePath = path.join(captureDir, `manabrew-real-session-${startedAt}.jsonl`);
const summaryPath = path.join(captureDir, `manabrew-real-session-${startedAt}.summary.json`);

const summary = {
  relayUrl,
  roomName,
  username,
  startedAt,
  capturePath,
  events: [],
  counts: {},
  roomId: null,
  gameId: null,
  playerOrder: null,
  mySlot: null,
  prompts: [],
  states: [],
  errors: [],
};

fs.mkdirSync(captureDir, { recursive: true });

let ws;
let done = false;
let sentStart = false;
let mySlot = null;
let promptResponses = 0;
let stateMessages = 0;
let promptMessages = 0;
let lastPromptKeys = new Set();
let botSpawnRequested = false;
let deckSelectionRequested = false;
let readyRequested = false;
let gameStartedSeen = false;

function record(direction, message) {
  const entry = {
    at: new Date().toISOString(),
    direction,
    type: message?.type ?? message?.kind ?? "unknown",
    message,
  };
  fs.appendFileSync(capturePath, `${JSON.stringify(entry)}\n`);
  summary.counts[entry.type] = (summary.counts[entry.type] ?? 0) + 1;
}

function note(event, data = {}) {
  const item = { at: new Date().toISOString(), event, ...data };
  summary.events.push(item);
  console.log(`[capture] ${event}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ""}`);
}

function send(message) {
  record("out", message);
  ws.send(JSON.stringify(message));
}

function messageId() {
  return crypto.randomUUID();
}

function basicDeck(name, land, creature) {
  const cards = [];
  for (let i = 0; i < 40; i += 1) cards.push(card(`${land.toLowerCase()}-${i}`, land));
  for (let i = 0; i < 20; i += 1) cards.push(card(`creature-${i}`, creature));
  return { name, cards };
}

function commanderDeck(name) {
  const cards = [];
  for (let i = 0; i < 49; i += 1) cards.push(card(`mountain-${i}`, "Mountain"));
  for (let i = 0; i < 50; i += 1) cards.push(card(`hill-giant-${i}`, "Hill Giant"));
  const commander = card("neheb-the-worthy", "Neheb, the Worthy");
  return {
    name,
    format: "commander",
    cards,
    commanders: [commander],
  };
}

function card(id, name) {
  return {
    identity: {
      id,
      name,
      setCode: "",
      cardNumber: "0",
    },
  };
}

function spawnBot(roomId, index) {
  return {
    type: "BroadcastState",
    state: {
      kind: "roomRelay",
      protocol: "self-hosted-node",
      version: 1,
      messageId: messageId(),
      fromPlayer: username,
      roomId,
      payload: {
        type: "spawnBot",
        deck: {
          deckName: `Capture Bot ${index}`,
          deck: commanderDeck(`Capture Bot ${index}`),
          commanderName: "Neheb, the Worthy",
        },
      },
    },
    target_player: null,
  };
}

function setDeckSelection() {
  return {
    type: "SetDeckSelection",
    deck_name: "Capture Player",
    deck: commanderDeck("Capture Player"),
    published_deck_id: null,
    commander_name: "Neheb, the Worthy",
    avatar_url: null,
  };
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
    return response(forPlayer, promptId, {
      type: "chooseAction",
      output: { type: "pass", exhaustStack: false },
    });
  }

  if (type === "payManaCost" && input.canConfirmFromPool) {
    return response(forPlayer, promptId, {
      type: "payManaCost",
      output: { type: "pay", auto: true },
    });
  }

  if (type === "diceRolled") {
    return response(forPlayer, promptId, {
      type: "diceRolled",
      output: { type: "diceRolledAcknowledged" },
    });
  }

  return null;
}

function response(fromPlayer, promptId, action) {
  return {
    type: "BroadcastState",
    state: {
      kind: "response",
      fromPlayer,
      promptId,
      action,
    },
    target_player: null,
  };
}

function maybeStart(room) {
  if (sentStart || room.status !== "Lobby") return;
  if (room.players.length < minPlayersToStart) return;
  if (!room.players.every((player) => player.connected && player.ready && player.selected_deck_name)) return;

  sentStart = true;
  note("starting-game", { players: room.players.map((player) => player.username) });
  send({ type: "StartGame", format: "Commander" });
}

async function finish(reason) {
  if (done) return;
  done = true;
  note("finished", { reason });
  summary.finishedAt = new Date().toISOString();
  summary.reason = reason;
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  try {
    ws.close();
  } catch {}
  setTimeout(() => process.exit(0), 25).unref();
}

function handleStateEnvelope(serverMessage) {
  const envelope = serverMessage.state;
  if (!envelope || typeof envelope !== "object") return;

  if (envelope.kind === "state") {
    stateMessages += 1;
    summary.states.push({
      index: stateMessages,
      forPlayer: envelope.forPlayer,
      hasFingerprint: Boolean(envelope.fingerprint),
      keys: envelope.state ? Object.keys(envelope.state).slice(0, 20) : [],
    });
    if (stateMessages >= 2 && promptMessages >= 1) {
      void finish("captured-state-and-prompt");
    }
    return;
  }

  if (envelope.kind === "stateDelta") {
    summary.states.push({
      index: stateMessages + 1,
      kind: "stateDelta",
      forPlayer: envelope.forPlayer,
      base: envelope.base,
      fingerprint: envelope.fingerprint,
    });
    return;
  }

  if (envelope.kind === "prompt") {
    promptMessages += 1;
    const inputType = envelope.prompt?.input?.type ?? "unknown";
    summary.prompts.push({
      index: promptMessages,
      forPlayer: envelope.forPlayer,
      promptId: envelope.prompt?.promptId ?? envelope.prompt?.prompt_id,
      inputType,
    });

    if (mySlot && envelope.forPlayer === mySlot) {
      const key = JSON.stringify(envelope.prompt);
      if (!lastPromptKeys.has(key)) {
        lastPromptKeys.add(key);
        const outbound = promptResponse(envelope.forPlayer, envelope.prompt);
        if (outbound) {
          promptResponses += 1;
          note("answering-prompt", { inputType, promptResponses });
          send(outbound);
        } else {
          note("unsupported-prompt", { inputType });
        }
      }
    }

    if (stateMessages >= 1 && promptMessages >= 1) {
      void finish("captured-state-and-prompt");
    }
    return;
  }

  if (envelope.kind === "error" || envelope.kind === "fatal") {
    summary.errors.push(envelope);
  }
}

async function main() {
  note("connecting", { relayUrl });
  ws = new WebSocket(relayUrl);

  ws.addEventListener("open", () => {
    note("connected");
    send({
      type: "Authenticate",
      username,
      password: serverKey,
      service: false,
      identity: null,
      client_platform: "unknown",
      client_version: null,
    });
  });

  ws.addEventListener("message", (event) => {
    const raw = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      record("in", { type: "unparsed", raw });
      return;
    }

    record("in", message);

    if (message.type === "AuthResult") {
      if (!message.success) {
        summary.errors.push(message);
        void finish("auth-failed");
        return;
      }
      note("authenticated", { username: message.username ?? username });
      send({ type: "ListRooms" });
      return;
    }

    if (message.type === "RoomList") {
      const room = message.rooms.find((candidate) => candidate.room_name === roomName);
      if (!room) {
        summary.errors.push({ message: `Room not found: ${roomName}`, rooms: message.rooms });
        void finish("room-not-found");
        return;
      }
      summary.roomId = room.room_id;
      note("joining-room", { roomId: room.room_id, roomName: room.room_name });
      send({
        type: "JoinRoom",
        room_id: room.room_id,
        observe: false,
        as_bot: false,
        password: roomPassword,
      });
      return;
    }

    if (message.type === "RoomUpdate") {
      const room = message.room;
      if (room?.room_id) summary.roomId = room.room_id;

      const playerNames = room.players.map((player) => player.username);
      const botCount = room.players.filter((player) => player.is_bot).length;
      const hasMe = playerNames.includes(username);

      if (hasMe && botCount < 3 && room.status === "Lobby" && !botSpawnRequested) {
        botSpawnRequested = true;
        for (let i = botCount + 1; i <= 3; i += 1) {
          note("spawning-bot", { index: i });
          send(spawnBot(room.room_id, i));
        }
      }

      const me = room.players.find((player) => player.username === username);
      if (me && !me.selected_deck_name && !deckSelectionRequested) {
        deckSelectionRequested = true;
        note("selecting-deck");
        send(setDeckSelection());
      }
      if (me && !me.ready && !readyRequested && me.selected_deck_name) {
        readyRequested = true;
        note("setting-ready");
        send({ type: "SetReady", ready: true });
      }

      maybeStart(room);
      return;
    }

    if (message.type === "GameStarted") {
      if (gameStartedSeen) return;
      gameStartedSeen = true;
      summary.gameId = message.game_id;
      summary.playerOrder = message.player_order;
      mySlot = message.player_order.findIndex((player) => player === username);
      mySlot = mySlot >= 0 ? `player-${mySlot}` : null;
      summary.mySlot = mySlot;
      note("game-started", { gameId: message.game_id, mySlot });
      send({ type: "RequestResync" });
      return;
    }

    if (message.type === "StateUpdate") {
      handleStateEnvelope(message);
      return;
    }

    if (message.type === "Error") {
      summary.errors.push(message);
      note("relay-error", { code: message.code, message: message.message });
    }
  });

  ws.addEventListener("error", (error) => {
    summary.errors.push({ type: "websocket-error", message: String(error.message ?? error) });
  });

  ws.addEventListener("close", () => {
    if (!done) void finish("socket-closed");
  });

  await delay(Number(process.env.MANABREW_CAPTURE_TIMEOUT_MS ?? 90000));
  await finish("timeout");
}

await main();
