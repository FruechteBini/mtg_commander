import assert from "node:assert/strict";
import { test } from "node:test";
import { ManabrewRelayClient } from "../src/index.mjs";

class FakeWebSocket {
  readyState = 0;
  sent = [];
  #listeners = new Map();

  addEventListener(name, listener) {
    const listeners = this.#listeners.get(name) ?? [];
    listeners.push(listener);
    this.#listeners.set(name, listeners);
  }

  open() {
    this.readyState = 1;
    this.#emit("open", {});
  }

  receive(message) {
    this.#emit("message", { data: JSON.stringify(message) });
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.#emit("close", { code, reason });
  }

  disconnect() {
    this.close(1006, "network lost");
  }

  #emit(name, event) {
    for (const listener of this.#listeners.get(name) ?? []) listener(event);
  }
}

function setup(overrides = {}) {
  const sockets = [];
  const client = new ManabrewRelayClient({
    url: "ws://relay.test",
    username: "player-a",
    password: "server-secret",
    reconnectMinDelayMs: 0,
    reconnectMaxDelayMs: 0,
    webSocketFactory: () => {
      const socket = new FakeWebSocket();
      sockets.push(socket);
      return socket;
    },
    ...overrides,
  });
  return { client, sockets };
}

test("authenticates, tracks state and exposes typed room commands", () => {
  const { client, sockets } = setup({ reconnect: false });
  const messages = [];
  client.on("message", (message) => messages.push(message));

  client.connect();
  sockets[0].open();
  assert.deepEqual(sockets[0].sent[0], {
    type: "Authenticate",
    username: "player-a",
    password: "server-secret",
    service: false,
    identity: null,
    client_platform: "unknown",
    client_version: null,
  });

  sockets[0].receive({ type: "AuthResult", success: true, player_id: "relay-player-1" });
  assert.equal(client.status, "authenticated");
  assert.equal(client.snapshot.playerId, "relay-player-1");

  client.listRooms();
  client.joinRoom({ roomId: "room-1", password: "room-secret" });
  const deck = { format: "commander", mainboard: [{ name: "Mountain", quantity: 99 }] };
  client.setDeckSelection({ deckName: "Test Deck", deck, commanderName: "Krenko" });
  client.setReady(true);
  client.spawnBots({ roomId: "room-1", decks: [deck, deck, deck] });
  client.startGame();
  client.requestResync();
  client.respond({
    fromPlayer: "player-0",
    promptId: 17,
    actionType: "chooseAction",
    output: { type: "pass", exhaustStack: false },
  });

  assert.deepEqual(sockets[0].sent.slice(1).map((message) => message.type), [
    "ListRooms",
    "JoinRoom",
    "SetDeckSelection",
    "SetReady",
    "BroadcastState",
    "StartGame",
    "RequestResync",
    "BroadcastState",
  ]);
  assert.deepEqual(sockets[0].sent[3].deck, deck);
  assert.deepEqual(sockets[0].sent[5].state.payload, {
    type: "spawnBot",
    deck,
    decks: [deck, deck, deck],
  });
  assert.equal(sockets[0].sent.at(-1).state.promptId, 17);
  assert.equal(messages.length, 1);
});

test("does not reconnect after authentication is rejected", async () => {
  const { client, sockets } = setup();
  client.connect();
  sockets[0].open();
  sockets[0].receive({ type: "AuthResult", success: false, error: "invalid key" });

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(client.status, "authFailed");
  assert.equal(client.snapshot.lastError, "invalid key");
  assert.equal(sockets.length, 1);
});

test("emits state, delta, prompt and errors while retaining the latest full state", () => {
  const { client, sockets } = setup({ reconnect: false });
  const seen = { state: 0, stateDelta: 0, prompt: 0, engineError: 0 };
  for (const name of Object.keys(seen)) client.on(name, () => { seen[name] += 1 });

  client.connect();
  sockets[0].open();
  sockets[0].receive({ type: "AuthResult", success: true });
  sockets[0].receive({
    type: "StateUpdate",
    state: {
      kind: "state",
      forPlayer: "player-0",
      fingerprint: "state-1",
      state: {
        gameView: {
          gameId: "game-1",
          turn: 1,
          step: "main1",
          activePlayerId: "player-0",
          priorityPlayerId: "player-0",
          gameOver: false,
          players: [{ id: "player-0", name: "Player", life: 40 }],
          zones: [],
          stack: [],
        },
      },
    },
  });
  sockets[0].receive({
    type: "StateUpdate",
    state: { kind: "stateDelta", forPlayer: "player-0", base: "state-1", fingerprint: "state-2", patch: [] },
  });
  sockets[0].receive({
    type: "StateUpdate",
    state: {
      kind: "prompt",
      forPlayer: "player-0",
      prompt: { promptId: 3, decidingPlayerId: "player-0", input: { type: "chooseAction", actions: [] } },
    },
  });
  sockets[0].receive({ type: "StateUpdate", state: { kind: "error", message: "bad response" } });

  assert.deepEqual(seen, { state: 1, stateDelta: 1, prompt: 1, engineError: 1 });
  assert.equal(client.latestState("player-0").fingerprint, "state-1");
  assert.equal(client.activePrompt("player-0").prompt.promptId, 3);
  assert.equal(client.snapshot.lastError, "bad response");
});

test("rejects malformed incoming data without delivering it as a message", () => {
  const { client, sockets } = setup({ reconnect: false });
  let invalid = 0;
  let delivered = 0;
  client.on("invalidMessage", () => { invalid += 1 });
  client.on("message", () => { delivered += 1 });

  client.connect();
  sockets[0].open();
  sockets[0].receive({ type: "AuthResult", success: "yes" });

  assert.equal(invalid, 1);
  assert.equal(delivered, 0);
  assert.equal(client.status, "authenticating");
});

test("reconnects after an unexpected close and does not reconnect after explicit close", async () => {
  const { client, sockets } = setup();
  client.connect();
  sockets[0].open();
  sockets[0].receive({ type: "AuthResult", success: true });
  sockets[0].disconnect();

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(sockets.length, 2);
  assert.equal(client.status, "reconnecting");

  sockets[1].open();
  sockets[1].receive({ type: "AuthResult", success: true });
  assert.equal(client.status, "authenticated");

  client.close();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(sockets.length, 2);
  assert.equal(client.status, "closed");
});
