import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import type { AgentPrompt } from "@mtg-commander/shared";
import { createInteractiveSession, type RelaySessionClient } from "./engine-session.js";

class FakeRelay {
  sent: Array<{ method: string; args: unknown[] }> = [];
  private handlers = new Map<string, Array<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as (payload: unknown) => void);
    this.handlers.set(event, list);
  }

  emit(event: string, payload: unknown): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(payload);
  }

  calls(method: string): number {
    return this.sent.filter((entry) => entry.method === method).length;
  }

  argsOf(method: string): unknown | undefined {
    return this.sent.find((entry) => entry.method === method)?.args[0];
  }

  listRooms(): void {
    this.sent.push({ method: "listRooms", args: [] });
  }
  joinRoom(options: unknown): void {
    this.sent.push({ method: "joinRoom", args: [options] });
  }
  setDeckSelection(selection: unknown): void {
    this.sent.push({ method: "setDeckSelection", args: [selection] });
  }
  setReady(ready: unknown): void {
    this.sent.push({ method: "setReady", args: [ready] });
  }
  spawnBots(options: unknown): void {
    this.sent.push({ method: "spawnBots", args: [options] });
  }
  startGame(format?: unknown): void {
    this.sent.push({ method: "startGame", args: [format] });
  }
  requestResync(): void {
    this.sent.push({ method: "requestResync", args: [] });
  }
  respond(options: unknown): void {
    this.sent.push({ method: "respond", args: [options] });
  }
}

const deckUrl = new URL("../../../decks/dina-sacrifice.txt", import.meta.url);
const deckText = fs.readFileSync(deckUrl, "utf8");

function baseConfig() {
  return {
    username: "mtg-api-test",
    roomName: "MTG-Commander PoC",
    roomPassword: "local-dev",
    deck: {
      deckText,
      owner: "Korbi",
      name: "Dina Sacrifice",
      commanderName: "Dina, Essence Brewer",
    },
    spawnBots: true,
    botCount: 3,
  };
}

function roomUpdate(players: unknown[]) {
  return {
    type: "RoomUpdate",
    room: { room_id: "room-1", room_name: "MTG-Commander PoC", status: "Lobby", players },
  };
}

const meWithoutDeck = { username: "mtg-api-test", connected: true, ready: false, selected_deck_name: null, is_bot: false };
const botPlayer = (index: number) => ({
  username: `bot-${index}`,
  connected: true,
  ready: true,
  selected_deck_name: "Dina Sacrifice Bot",
  is_bot: true,
});

test("session joins the lobby, selects deck, readies, spawns bots and starts once complete", () => {
  const relay = new FakeRelay();
  const session = createInteractiveSession(relay as unknown as RelaySessionClient, baseConfig());

  relay.emit("message", { type: "AuthResult", success: true });
  assert.equal(relay.calls("listRooms"), 1);

  relay.emit("message", {
    type: "RoomList",
    rooms: [
      { room_id: "room-2", room_name: "MTG-Commander PoC", status: "InGame", players: [] },
      { room_id: "room-1", room_name: "MTG-Commander PoC", status: "Lobby", players: [meWithoutDeck] },
    ],
  });
  assert.deepEqual(relay.argsOf("joinRoom"), { roomId: "room-1", password: "local-dev" });

  relay.emit("message", roomUpdate([{ ...meWithoutDeck }]));
  assert.equal(relay.calls("spawnBots"), 1);
  assert.equal(relay.calls("setDeckSelection"), 1);
  assert.equal(relay.calls("setReady"), 0);
  assert.equal(relay.calls("startGame"), 0);

  const meWithDeck = { ...meWithoutDeck, selected_deck_name: "Dina Sacrifice" };
  relay.emit("message", roomUpdate([meWithDeck, botPlayer(1), botPlayer(2), botPlayer(3)]));
  assert.equal(relay.calls("setReady"), 1);
  assert.deepEqual(relay.argsOf("setReady"), true);

  const allReady = { ...meWithDeck, ready: true };
  relay.emit("message", roomUpdate([allReady, botPlayer(1), botPlayer(2), botPlayer(3)]));
  assert.equal(relay.calls("startGame"), 1);
  assert.deepEqual(relay.argsOf("startGame"), "Commander");

  // repeated room updates must not start a second game
  relay.emit("message", roomUpdate([allReady, botPlayer(1), botPlayer(2), botPlayer(3)]));
  assert.equal(relay.calls("startGame"), 1);

  const snapshot = session.snapshot("authenticated");
  assert.equal(snapshot.roomId, "room-1");
  assert.equal(snapshot.humanPlayerName, "mtg-api-test");
  assert.equal(snapshot.lastError, null);
});

function startedGame(username: string, order: string[]) {
  return { type: "GameStarted", game_id: "game-1", room_id: "room-1", player_order: order.map((name) => name) };
}

function stateFor(player: string, turn: number) {
  return {
    type: "StateUpdate",
    state: {
      kind: "state",
      forPlayer: player,
      state: {
        gameView: {
          gameId: "game-1",
          players: [],
          zones: [],
          stack: [],
          activePlayerId: player,
          priorityPlayerId: player,
          step: "Untap",
          turn,
          gameOver: false,
        },
      },
    },
  };
}

function promptFor(player: string, prompt: AgentPrompt) {
  return { type: "StateUpdate", state: { kind: "prompt", forPlayer: player, prompt } };
}

test("session tracks viewer state and only opens prompts for the own seat", () => {
  const relay = new FakeRelay();
  const config = baseConfig();
  const session = createInteractiveSession(relay as unknown as RelaySessionClient, config);

  relay.emit("message", startedGame(config.username, [config.username, "bot-1", "bot-2", "bot-3"]));
  assert.equal(relay.calls("requestResync"), 1);

  const snapshotAfterStart = session.snapshot("authenticated");
  assert.equal(snapshotAfterStart.gameId, "game-1");
  assert.equal(snapshotAfterStart.viewerPlayerId, "player-0");
  assert.equal(snapshotAfterStart.gameView, null);

  relay.emit("message", stateFor("player-2", 3));
  assert.equal(session.snapshot("authenticated").gameView, null);

  relay.emit("message", stateFor("player-0", 4));
  const snapshot = session.snapshot("authenticated");
  assert.ok(snapshot.gameView);
  assert.equal(snapshot.gameView?.turn, 4);

  const foreignPrompt: AgentPrompt = {
    promptId: 5,
    decidingPlayerId: "player-1",
    input: { type: "chooseAction", actions: [] },
  };
  relay.emit("message", promptFor("player-1", foreignPrompt));
  assert.equal(session.snapshot("authenticated").prompt, null);

  const ownPrompt: AgentPrompt = {
    promptId: 7,
    decidingPlayerId: "player-0",
    input: { type: "chooseAction", actions: [{ id: "prompt-action-0", type: "playLand", label: "Play Forest" }] },
  };
  relay.emit("message", promptFor("player-0", ownPrompt));
  assert.equal(session.snapshot("authenticated").prompt, ownPrompt);
});

test("repeated GameStarted resync echoes must not trigger a resync loop", () => {
  const relay = new FakeRelay();
  const config = baseConfig();
  const session = createInteractiveSession(relay as unknown as RelaySessionClient, config);

  relay.emit("message", startedGame(config.username, [config.username, "bot-1", "bot-2", "bot-3"]));
  assert.equal(relay.calls("requestResync"), 1);

  relay.emit("message", stateFor("player-0", 1));
  assert.ok(session.snapshot("authenticated").gameView);

  // Forge echoes GameStarted with every resync answer: same game with a known
  // gameView must never trigger another resync, or the session loops forever.
  for (let echo = 0; echo < 3; echo += 1) {
    relay.emit("message", startedGame(config.username, [config.username, "bot-1", "bot-2", "bot-3"]));
  }
  assert.equal(relay.calls("requestResync"), 1);

  // a genuinely new game id still triggers a resync
  relay.emit("message", { type: "GameStarted", game_id: "game-2", room_id: "room-1", player_order: [config.username, "bot-1"] });
  assert.equal(relay.calls("requestResync"), 2);
});

test("fresh process reconnects into a running room when our seat is listed", () => {
  const relay = new FakeRelay();
  const config = baseConfig();
  const session = createInteractiveSession(relay as unknown as RelaySessionClient, config);

  relay.emit("message", { type: "AuthResult", success: true });
  relay.emit("message", {
    type: "RoomList",
    rooms: [
      {
        room_id: "room-1",
        room_name: "MTG-Commander PoC",
        status: "InGame",
        players: [{ ...meWithoutDeck, connected: false }],
      },
    ],
  });
  assert.equal(relay.calls("joinRoom"), 0);
  assert.equal(relay.calls("requestResync"), 1);
  assert.equal(session.snapshot("authenticated").lastError, null);

  relay.emit("message", startedGame(config.username, [config.username, "bot-1", "bot-2", "bot-3"]));
  relay.emit("message", stateFor("player-0", 2));
  assert.ok(session.snapshot("authenticated").gameView);
});

test("respond validates ownership, prompt freshness and actionType, then clears the prompt", () => {
  const relay = new FakeRelay();
  const config = baseConfig();
  const session = createInteractiveSession(relay as unknown as RelaySessionClient, config);

  const unstarted = session.respond({ promptId: 1, actionType: "chooseAction", output: { type: "pass", exhaustStack: false } });
  assert.equal(unstarted.ok, false);

  relay.emit("message", startedGame(config.username, [config.username, "bot-1", "bot-2", "bot-3"]));
  relay.emit(
    "message",
    promptFor("player-0", {
      promptId: 9,
      decidingPlayerId: "player-0",
      input: { type: "chooseAction", actions: [{ id: "a1", type: "playLand", label: "Play Forest" }] },
    }),
  );

  const wrongPrompt = session.respond({ promptId: 8, actionType: "chooseAction", output: { type: "pass", exhaustStack: false } });
  assert.equal(wrongPrompt.ok, false);

  const wrongType = session.respond({ promptId: 9, actionType: "mulligan", output: { type: "mulliganDecision", keep: true } });
  assert.equal(wrongType.ok, false);
  assert.equal(relay.calls("respond"), 0);

  const accepted = session.respond({
    promptId: 9,
    actionType: "chooseAction",
    output: { type: "act", actionId: "a1" },
  });
  assert.equal(accepted.ok, true);
  assert.deepEqual(relay.argsOf("respond"), {
    fromPlayer: "player-0",
    promptId: 9,
    actionType: "chooseAction",
    output: { type: "act", actionId: "a1" },
  });
  assert.equal(session.snapshot("authenticated").prompt, null);

  const replayed = session.respond({ promptId: 9, actionType: "chooseAction", output: { type: "act", actionId: "a1" } });
  assert.equal(replayed.ok, false);
  assert.equal(relay.calls("respond"), 1);
});

test("gameOver prompt and engine errors are surfaced without blocking the session", () => {
  const relay = new FakeRelay();
  const config = baseConfig();
  const session = createInteractiveSession(relay as unknown as RelaySessionClient, config);

  relay.emit("message", startedGame(config.username, [config.username, "bot-1", "bot-2", "bot-3"]));
  relay.emit(
    "message",
    promptFor("player-0", { promptId: 4294967295, decidingPlayerId: "player-0", input: { type: "gameOver" } }),
  );
  const ended = session.snapshot("authenticated");
  assert.equal(ended.gameEnded, true);
  assert.equal(ended.prompt, null);

  relay.emit("message", { type: "Error", code: "room_full", message: "Raum ist voll" });
  assert.match(session.snapshot("authenticated").lastError ?? "", /Raum ist voll/);
});

test("observer mode skips deck, ready and bots and reports missing rooms", () => {
  const relay = new FakeRelay();
  const config = { ...baseConfig(), deck: null };
  const session = createInteractiveSession(relay as unknown as RelaySessionClient, config);

  relay.emit("message", { type: "AuthResult", success: true });
  relay.emit("message", { type: "RoomList", rooms: [] });
  assert.match(session.snapshot("authenticated").lastError ?? "", /Raum nicht gefunden/);

  relay.emit("message", { type: "RoomList", rooms: [] });
  relay.emit("message", roomUpdate([meWithoutDeck]));
  assert.equal(relay.calls("setDeckSelection"), 0);
  assert.equal(relay.calls("spawnBots"), 0);
  assert.equal(relay.calls("setReady"), 0);
  assert.equal(relay.calls("startGame"), 0);
});

