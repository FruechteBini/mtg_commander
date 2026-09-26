#!/usr/bin/env node

/**
 * DECK-002 proof: import a real playgroup deck list through the shared
 * deck-list module, convert it to the Manabrew deck format and start a real
 * four-player Commander game on the running Forge/Manabrew stack with it.
 *
 * Success criteria:
 * - importCommanderDeck returns a valid 100-card model with the meta commander
 * - toManabrewDeckSelection converts it deterministically
 * - Forge accepts the deck (game starts, no engine errors)
 * - first state for our perspective shows the commander in the command zone
 *   and 99 cards in library (+hand)
 */

import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ManabrewRelayClient } from "@mtg-commander/manabrew-client";
import {
  importCommanderDeck,
  toManabrewDeckSelection,
} from "../packages/shared/dist/deck-list.js";

const relayUrl = process.env.MANABREW_RELAY_URL ?? "ws://localhost:9443";
const serverKey = process.env.MANABREW_SERVER_KEY ?? "local-dev-change-me";
const roomName = process.env.MANABREW_ROOM_NAME ?? "MTG-Commander PoC";
const roomPassword = process.env.MANABREW_ROOM_PASSWORD ?? "local-dev";
const timeoutMs = Number(process.env.MANABREW_DECK_START_TIMEOUT_MS ?? 90000);

const deckFile = process.env.DECK_FILE ?? "decks/dina-sacrifice.txt";
const deckOwner = process.env.DECK_OWNER ?? "Korbi";
const deckName = process.env.DECK_NAME ?? "Dina Sacrifice";
const commanderName = process.env.DECK_COMMANDER ?? "Dina, Essence Brewer";

const username = `deck-proof-${Date.now()}`;
const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
const summaryPath = path.join("captures", `deck-forge-start-${startedAt}.summary.json`);

const summary = {
  relayUrl,
  roomName,
  username,
  deckFile,
  deckOwner,
  deckName,
  commanderName,
  startedAt,
  import: null,
  manabrew: null,
  roomId: null,
  gameId: null,
  playerOrder: null,
  mySlot: null,
  events: [],
  errors: [],
  proof: null,
};

function note(event, data = {}) {
  const item = { at: new Date().toISOString(), event, ...data };
  summary.events.push(item);
  console.log(`[deck-proof] ${event}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ""}`);
}

function fail(reason) {
  summary.result = "failed";
  summary.reason = reason;
  finishAndExit(1);
}

function finishAndExit(code) {
  summary.finishedAt = new Date().toISOString();
  fs.mkdirSync("captures", { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[deck-proof] summary -> ${summaryPath} (exit ${code})`);
  process.exit(code);
}

// --- Step 1: import + validate through the DECK-001 module -------------------

const deckText = fs.readFileSync(path.resolve(deckFile), "utf8");
const imported = importCommanderDeck(deckText, {
  owner: deckOwner,
  name: deckName,
  commanderNames: [commanderName],
  sourceUrl: null,
  importedAt: new Date().toISOString(),
});

if (!imported.ok) {
  console.error("[deck-proof] import failed:", JSON.stringify(imported.issues, null, 2));
  process.exit(1);
}
const deck = imported.deck;
const totalCards =
  deck.commanders.length + deck.cards.reduce((sum, entry) => sum + entry.quantity, 0);
if (totalCards !== 100) {
  console.error(`[deck-proof] expected 100 cards, got ${totalCards}`);
  process.exit(1);
}
if (deck.commanders.length !== 1 || deck.commanders[0].name !== commanderName) {
  console.error(`[deck-proof] commander mismatch: ${JSON.stringify(deck.commanders)}`);
  process.exit(1);
}

fs.mkdirSync("decks", { recursive: true });
const deckModelPath = path.join("decks", `${path.basename(deckFile, ".txt")}.json`);
fs.writeFileSync(deckModelPath, `${JSON.stringify(deck, null, 2)}\n`);
summary.import = {
  ok: true,
  deckModelPath,
  commander: deck.commanders[0].name,
  uniqueCards: deck.cards.length,
  totalCards,
};
note("import-ok", {
  commander: deck.commanders[0].name,
  uniqueCards: deck.cards.length,
  totalCards,
});

// --- Step 2: convert to Manabrew deck selection -------------------------------

const selection = toManabrewDeckSelection(deck);
const manabrewCardCount = selection.deck.cards.length + selection.deck.commanders.length;
if (manabrewCardCount !== 100) {
  console.error(`[deck-proof] manabrew deck expected 100 cards, got ${manabrewCardCount}`);
  process.exit(1);
}
summary.manabrew = {
  deckName: selection.deckName,
  commanderName: selection.commanderName,
  cardCount: manabrewCardCount,
};
note("manabrew-conversion-ok", {
  cards: selection.deck.cards.length,
  commanders: selection.deck.commanders.length,
});

const botSelections = [1, 2, 3].map((index) => ({
  deckName: `${deckName} Bot ${index}`,
  deck: selection.deck,
  commanderName: selection.commanderName,
}));

// --- Step 3: connect and run the real four-player start ----------------------

let client;
let sentStart = false;
let botSpawnRequested = false;
let deckSelectionRequested = false;
let readyRequested = false;
let gameStartedSeen = false;
let mySlot = null;
let proofComplete = false;

function zoneName(zone) {
  return String(zone?.zone ?? zone?.name ?? zone?.id ?? "").toLowerCase();
}

function zoneCardCount(zone) {
  if (typeof zone?.count === "number") return zone.count;
  if (Array.isArray(zone?.cards)) return zone.cards.length;
  const count = zone?.cardCount ?? zone?.card_count ?? null;
  return typeof count === "number" ? count : 0;
}

function cardViewName(cardView) {
  return (
    cardView?.identity?.name ?? cardView?.card?.name ?? cardView?.name ?? cardView?.cardName ?? ""
  );
}

function checkProof(gameView) {
  if (!gameView || proofComplete) return;
  const myZones = (Array.isArray(gameView.zones) ? gameView.zones : []).filter(
    (zone) => zone?.ownerId === mySlot,
  );
  const commandZone = myZones.find((zone) => zoneName(zone).includes("command"));
  const libraryZone = myZones.find((zone) => zoneName(zone) === "library");
  const handZone = myZones.find((zone) => zoneName(zone) === "hand");

  const commandCards = commandZone?.cards ?? [];
  const commanderInCommand = commandCards.some((cardView) =>
    cardViewName(cardView).toLowerCase() === commanderName.toLowerCase(),
  );
  const libraryCount = libraryZone ? zoneCardCount(libraryZone) : 0;
  const handCount = handZone ? zoneCardCount(handZone) : 0;
  const libraryPlusHandOk = libraryCount === 99 || libraryCount + handCount === 99;

  summary.proof = {
    zones: myZones.map((zone) => ({ name: zoneName(zone), count: zoneCardCount(zone) })),
    commanderInCommand,
    commandZoneSize: zoneCardCount(commandZone ?? {}),
    commandZoneNames: commandCards.map((cardView) => cardViewName(cardView)),
    libraryCount,
    handCount,
    libraryPlusHandOk,
    turn: gameView.turn ?? gameView.turnNumber ?? null,
  };
  summary.gameViewSample = gameView;

  if (commanderInCommand && zoneCardCount(commandZone ?? {}) === 1 && libraryPlusHandOk) {
    proofComplete = true;
    summary.result = "ok";
    note("proof-complete", {
      commanderInCommand,
      libraryCount,
      handCount,
    });
    delete summary.gameViewSample;
    finishAndExit(0);
  }
}

function maybeStart(room) {
  if (sentStart || room.status !== "Lobby") return;
  if (room.players.length < 4) return;
  if (!room.players.every((player) => player.connected && player.ready && player.selected_deck_name)) {
    return;
  }

  sentStart = true;
  note("starting-game", { players: room.players.map((player) => player.username) });
  client.startGame("Commander");
}

async function main() {
  note("connecting", { relayUrl, roomName });
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

  client.on("message", (message) => {
    if (message.type === "AuthResult") {
      if (!message.success) {
        summary.errors.push(message);
        void fail("auth-failed");
        return;
      }
      note("authenticated", { username: message.username ?? username });
      client.listRooms();
      return;
    }

    if (message.type === "RoomList") {
      const room = message.rooms.find((candidate) => candidate.room_name === roomName);
      if (!room) {
        summary.errors.push({ message: `Room not found: ${roomName}`, rooms: message.rooms });
        void fail("room-not-found");
        return;
      }
      summary.roomId = room.room_id;
      note("joining-room", {
        roomId: room.room_id,
        roomName: room.room_name,
        players: room.players?.length ?? 0,
      });
      client.joinRoom({ roomId: room.room_id, password: roomPassword });
      return;
    }

    if (message.type === "RoomUpdate") {
      const room = message.room;
      if (room?.room_id) summary.roomId = room.room_id;

      const botCount = room.players.filter((player) => player.is_bot).length;
      const hasMe = room.players.some((player) => player.username === username);

      if (hasMe && botCount < 3 && room.status === "Lobby" && !botSpawnRequested) {
        botSpawnRequested = true;
        note("spawning-bots", { requested: 3 - botCount });
        client.spawnBots({ roomId: room.room_id, decks: botSelections });
      }

      const me = room.players.find((player) => player.username === username);
      if (me && !me.selected_deck_name && !deckSelectionRequested) {
        deckSelectionRequested = true;
        note("selecting-deck", { deckName: selection.deckName });
        client.setDeckSelection(selection);
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
      summary.gameId = message.game_id;
      summary.playerOrder = message.player_order;
      const slotIndex = message.player_order.findIndex((player) => player === username);
      mySlot = slotIndex >= 0 ? `player-${slotIndex}` : null;
      summary.mySlot = mySlot;
      note("game-started", { gameId: message.game_id, mySlot });
      client.requestResync();
      return;
    }

    if (message.type === "StateUpdate") {
      const envelope = message.state;
      if (!envelope || typeof envelope !== "object") return;
      if (envelope.kind === "state") {
        const gameView = envelope.state?.gameView ?? null;
        if (envelope.forPlayer === mySlot) checkProof(gameView);
      }
      if (envelope.kind === "error" || envelope.kind === "fatal") {
        summary.errors.push(envelope);
        void fail("engine-error");
      }
      return;
    }

    if (message.type === "Error") {
      summary.errors.push(message);
      note("relay-error", { code: message.code, message: message.message });
    }
  });

  client.on("error", (error) => {
    summary.errors.push({ type: "websocket-error", message: String(error?.message ?? error) });
  });
  client.on("status", ({ status }) => {
    if (status === "failed") void fail("reconnect-exhausted");
  });

  client.connect();

  await delay(timeoutMs);
  fail("timeout");
}

await main();
