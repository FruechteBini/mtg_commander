import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import url from "node:url";
import { parseRelayMessage } from "../packages/shared/src/manabrew-protocol-parser.mjs";
import { normalizeGameView, normalizeStateEnvelope, UI_MODEL_VERSION } from "../packages/shared/dist/game-view.js";

const root = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));

// Determinism helper: recursively reverses object key order so JSON parsing
// order cannot leak into the normalized output.
function reverseKeyOrder(value) {
  if (Array.isArray(value)) return value.map(reverseKeyOrder);
  if (value === null || typeof value !== "object") return value;
  const flipped = {};
  for (const key of Object.keys(value).reverse()) flipped[key] = reverseKeyOrder(value[key]);
  return flipped;
}

// --- Four-seat fixture derived from real captures (UI-001) -------------------

const fourSeat = JSON.parse(
  fs.readFileSync(path.join(root, "packages/shared/fixtures/game-view-four-player.json"), "utf8"),
);
const fourSeatMessages = fourSeat.messages.map(parseRelayMessage);
assert.equal(fourSeatMessages[0].type, "GameStarted");
assert.deepEqual(fourSeatMessages[0].player_order, ["seat-human", "seat-bot-1", "seat-bot-2", "seat-bot-3"]);

const stateUpdate = fourSeatMessages.find((message) => message.type === "StateUpdate");
const view = normalizeStateEnvelope(stateUpdate.state);

assert.equal(view.modelVersion, UI_MODEL_VERSION);
assert.equal(view.modelVersion, 1);
assert.equal(view.gameId, "f8d53c1d-f6e3-4039-bdb9-d9863878c174");
assert.equal(view.forPlayerId, "player-0");
assert.equal(view.playerCount, 4);
assert.deepEqual(view.players.map((player) => player.id), ["player-0", "player-1", "player-2", "player-3"]);
assert.deepEqual(view.players.map((player) => player.seat), [0, 1, 2, 3]);
assert.equal(view.players.filter((player) => player.isHuman).length, 1);
assert.equal(view.players[0].isHuman, true);
assert.equal(view.players[1].isHuman, false);
assert.ok(view.players.every((player) => player.life === 40));
assert.ok(view.players.every((player) => player.status === "playing"));
assert.equal(view.players.filter((player) => player.isActive).length, 1);
assert.equal(view.players.filter((player) => player.hasPriority).length, 1);
assert.equal(view.players[0].isActive, true);
assert.equal(view.players[0].hasPriority, true);
assert.deepEqual(view.players[0].commanderCasts, [{ cardId: "engine-card-199", casts: 0 }]);
assert.deepEqual(view.players[3].commanderCasts, [{ cardId: "engine-card-202", casts: 0 }]);
assert.deepEqual(view.players[0].commanderDamage, []);
assert.deepEqual(view.players[0].manaPool, { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0, other: {} });

assert.equal(view.playerZones.length, 4);
assert.deepEqual(view.sharedZones, []);
for (const group of view.playerZones) {
  assert.deepEqual(group.zones.map((zone) => zone.kind), [
    "battlefield", "hand", "library", "graveyard", "exile", "command",
  ]);
}

const seat0 = view.playerZones[0];
const commandZone = seat0.zones.find((zone) => zone.kind === "command");
assert.equal(commandZone.knownCount, 1);
assert.equal(commandZone.reportedCount, 1);
assert.equal(commandZone.hidden, false);
const neheb = commandZone.cards[0];
assert.equal(neheb.id, "engine-card-199");
assert.equal(neheb.name, "Neheb, the Worthy");
assert.equal(neheb.visibility, "visible");
assert.equal(neheb.setCode, "AKR");
assert.equal(neheb.cardNumber, "246");
assert.equal(neheb.isToken, false);
assert.deepEqual(neheb.colors, ["B", "R"]);
assert.deepEqual(neheb.types, ["Creature"]);
assert.deepEqual(neheb.supertypes, ["Legendary"]);
assert.deepEqual(neheb.subtypes, ["Minotaur", "Warrior"]);
assert.deepEqual(neheb.keywords, ["First Strike"]);
assert.deepEqual(neheb.creature, { power: "2", toughness: "2", damage: 0 });
assert.equal(neheb.cmc, 3);
assert.equal(neheb.manaCost, "{1}{B}{R}");
assert.equal(neheb.summoningSick, true);
assert.equal(neheb.tapped, false);
assert.equal(neheb.commanderTax, 0);

const libraryZone = seat0.zones.find((zone) => zone.kind === "library");
assert.equal(libraryZone.knownCount, 0);
assert.equal(libraryZone.reportedCount, 99);
assert.equal(libraryZone.hidden, true);

assert.deepEqual(view.turn, { turn: 0, displayTurn: 1, step: "untap", phase: "beginning" });
assert.equal(view.combat.combatPhaseActive, false);
assert.deepEqual(view.combat.assignments, []);
assert.deepEqual(view.stack, []);
assert.equal(view.activePlayerId, "player-0");
assert.equal(view.priorityPlayerId, "player-0");
assert.equal(view.gameOver, false);
assert.equal(view.winnerId, null);
assert.deepEqual(view.specialRoles, {
  monarchId: null, initiativeHolderId: null, dayTime: "neither", activePlaneNames: [],
});

// Determinism: same input twice and with fully reversed key order must produce
// byte-identical JSON.
const rawGameView = stateUpdate.state.state.gameView;
assert.deepEqual(normalizeGameView(rawGameView, { forPlayerId: "player-0" }), view);
assert.equal(
  JSON.stringify(normalizeGameView(reverseKeyOrder(rawGameView), { forPlayerId: "player-0" })),
  JSON.stringify(view),
);

// --- Shock session fixture: state transitions stay readable in the UI model --

const shock = JSON.parse(
  fs.readFileSync(path.join(root, "packages/shared/fixtures/protocol-session.json"), "utf8"),
);
const shockStates = shock.messages
  .map(parseRelayMessage)
  .filter((message) => message.type === "StateUpdate" && message.state.kind === "state");

const before = normalizeStateEnvelope(shockStates[0].state);
const after = normalizeStateEnvelope(shockStates[1].state);

assert.equal(before.playerCount, 4);
assert.equal(before.players[1].life - after.players[1].life, 2);
assert.equal(before.turn.displayTurn, 4);
assert.equal(before.turn.phase, "precombatMain");

const beforeHand = before.playerZones[0].zones.find((zone) => zone.kind === "hand");
assert.equal(beforeHand.knownCount, 1);
assert.equal(beforeHand.cards[0].name, "Shock");
assert.equal(beforeHand.cards[0].visibility, "visible");
assert.equal(beforeHand.cards[0].creature, null);

const afterGraveyard = after.playerZones[0].zones.find((zone) => zone.kind === "graveyard");
assert.equal(afterGraveyard.cards[0].name, "Shock");
assert.equal(after.playerZones[0].zones.find((zone) => zone.kind === "hand").knownCount, 0);
assert.equal(before.playerZones[1].zones.find((zone) => zone.kind === "library").hidden, true);
assert.deepEqual(before.stack, []);
assert.equal(before.playerZones.length, 4);
assert.deepEqual(before.playerZones[2].zones, []);
assert.deepEqual(before.playerZones[3].zones, []);

// --- Defensive mapping for fields not yet observed filled in real captures ---

const synthetic = normalizeGameView({
  gameId: "synthetic",
  players: [{
    id: "player-0",
    name: "Synthetic",
    life: 17,
    manaPool: { X: 2, B: 3, W: 1 },
    commanderCasts: { "engine-card-b": 2, "engine-card-a": 1 },
    commanderDamage: { "player-2": 5, "player-1": 8 },
    counters: { "time": 2, "poison": 1 },
  }],
  zones: [
    { zone: "sideboard", ownerId: "player-0", count: 15, cards: [] },
    { zone: "battlefield", ownerId: "player-0", count: 1, cards: [{
      id: "engine-card-x",
      identity: { name: "Shrapnel Beast", isToken: false },
      types: ["Artifact", "Creature"],
      color: "RB",
      visibility: "weird",
      power: "*",
      toughness: "3",
      damage: 1,
    }] },
  ],
  stack: [{
    controllerId: "player-0",
    source: { identity: { name: "Shock" } },
    targets: [{ id: "player-1", kind: "player" }, { id: "engine-card-y", kind: "card" }],
  }],
  activePlayerId: "player-0",
  priorityPlayerId: null,
  step: "combatDeclareAttackers",
  turn: 6,
  gameOver: false,
  combatAssignments: [{ attacker: "engine-card-x" }],
});

assert.equal(synthetic.players[0].manaPool.white, 1);
assert.equal(synthetic.players[0].manaPool.black, 3);
assert.deepEqual(synthetic.players[0].manaPool.other, { X: 2 });

const manaPerturbed = normalizeGameView({
  gameId: "synthetic",
  players: [{ id: "player-0", name: "Synthetic", life: 17, manaPool: { W: 1, X: 2, B: 3 } }],
  zones: [], stack: [], activePlayerId: "player-0", step: "untap", turn: 0, gameOver: false,
});
assert.equal(
  JSON.stringify(manaPerturbed.players[0].manaPool),
  JSON.stringify(synthetic.players[0].manaPool),
);

assert.deepEqual(synthetic.players[0].commanderCasts, [
  { cardId: "engine-card-a", casts: 1 }, { cardId: "engine-card-b", casts: 2 },
]);
assert.deepEqual(synthetic.players[0].commanderDamage, [
  { fromPlayerId: "player-1", damage: 8 }, { fromPlayerId: "player-2", damage: 5 },
]);
assert.deepEqual(synthetic.players[0].counters, { poison: 1, time: 2 });
assert.equal(synthetic.turn.step, "combatDeclareAttackers");
assert.equal(synthetic.turn.phase, "combat");
assert.equal(synthetic.combat.combatPhaseActive, true);
assert.deepEqual(synthetic.combat.assignments, [{ attacker: "engine-card-x" }]);

const unknownStep = normalizeGameView({
  gameId: "synthetic", players: [], zones: [], stack: [],
  activePlayerId: null, step: "cleanupX", turn: 9, gameOver: false,
});
assert.deepEqual(unknownStep.turn, { turn: 9, displayTurn: 10, step: "cleanupX", phase: "unknown" });

const sideboard = synthetic.playerZones[0].zones.find((zone) => zone.rawName === "sideboard");
assert.equal(sideboard.kind, "unknown");
assert.equal(sideboard.hidden, true);
assert.equal(synthetic.playerZones[0].zones[synthetic.playerZones[0].zones.length - 1].rawName, "sideboard");

const beast = synthetic.playerZones[0].zones.find((zone) => zone.kind === "battlefield").cards[0];
assert.equal(beast.visibility, "unknown");
assert.deepEqual(beast.colors, ["B", "R"]);
assert.deepEqual(beast.creature, { power: "*", toughness: "3", damage: 1 });

assert.deepEqual(synthetic.stack, [{
  id: "stack-0",
  name: "Shock",
  controllerId: "player-0",
  targets: [{ id: "player-1", kind: "player" }, { id: "engine-card-y", kind: "card" }],
}]);
assert.equal(synthetic.players.filter((player) => player.hasPriority).length, 0);

assert.throws(() => normalizeStateEnvelope({ kind: "prompt" }), /state envelope/);
assert.throws(() => normalizeGameView(null), /gameView object/);

// --- Optional: stream every real state in local captures through the model ---

let realStates = 0;
const captureDir = path.join(root, "captures");
if (fs.existsSync(captureDir)) {
  for (const file of fs.readdirSync(captureDir).filter((name) => name.endsWith(".jsonl"))) {
    const lines = readline.createInterface({ input: fs.createReadStream(path.join(captureDir, file)), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const record = JSON.parse(line);
      const message = record?.message;
      if (record?.direction !== "in" || message?.type !== "StateUpdate" || message?.state?.kind !== "state") continue;
      parseRelayMessage(message);
      const normalized = normalizeStateEnvelope(message.state);
      assert.equal(typeof normalized.gameId, "string");
      realStates += 1;
    }
  }
}

console.log(
  `Game view normalizer PASS: four-seat fixture (4 players x 6 zones, Neheb command zone, hidden libraries), ` +
  `Shock 40 -> 38 with hand -> graveyard, defensive fallbacks, determinism under key reordering, ` +
  `${realStates || "no local"} real capture states normalized.`,
);


