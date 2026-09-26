import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { normalizeStateEnvelope } from "@mtg-commander/shared";
import type { StateEnvelope } from "@mtg-commander/shared";
import {
  cardBadges,
  creatureStats,
  gameViewFromJson,
  manaEntries,
  opponentsOf,
  phaseLabel,
  playerDisplayName,
  roleBadges,
  turnHeadline,
  viewerSeatOf,
  zoneCountText,
  zoneLabel,
} from "./view-model.js";

const fixtureUrl = new URL("../../../../packages/shared/fixtures/game-view-four-player.json", import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, "utf8")) as { messages: Array<Record<string, unknown>> };
const stateUpdate = fixture.messages.find((message) => message.type === "StateUpdate");
if (!stateUpdate) throw new Error("Fixture enthaelt keinen StateUpdate");
const view = normalizeStateEnvelope(stateUpdate.state as unknown as StateEnvelope);

test("labels cover every zone kind and phase", () => {
  assert.equal(zoneLabel("battlefield"), "Schlachtfeld");
  assert.equal(zoneLabel("unknown"), "Unbekannte Zone");
  assert.equal(phaseLabel("beginning"), "Beginn");
  assert.equal(phaseLabel("combat"), "Kampf");
  assert.equal(turnHeadline(view.turn), "Zug 1 \u00b7 Beginn");
});

test("viewer perspective from the fixture is the human seat", () => {
  const viewer = viewerSeatOf(view);
  assert.equal(viewer?.id, "player-0");
  assert.equal(viewer?.isHuman, true);
  assert.equal(opponentsOf(view).length, 3);
  assert.equal(playerDisplayName(viewer!, "player-0"), "Du");
  assert.ok(roleBadges(viewer!).includes("Mensch"));
  for (const opponent of opponentsOf(view)) {
    assert.ok(!roleBadges(opponent).includes("Mensch"));
    assert.notEqual(playerDisplayName(opponent, "player-0"), "Du");
  }
});

test("zone counts stay honest about hidden libraries", () => {
  const zones = view.playerZones.find((group) => group.playerId === "player-0")?.zones ?? [];
  const library = zones.find((zone) => zone.kind === "library");
  assert.equal(library?.reportedCount, 99);
  assert.equal(library?.cards.length, 0);
  assert.equal(zoneCountText(library!), "verdeckt \u00b7 99 Karten");
  const command = zones.find((zone) => zone.kind === "command");
  assert.equal(zoneCountText(command!), "1 Karte");
});

test("cards expose stats and badges without crashing on unknown data", () => {
  const command = view.playerZones
    .find((group) => group.playerId === "player-0")!
    .zones.find((zone) => zone.kind === "command")!;
  const commander = command.cards[0]!;
  assert.equal(commander.name, "Neheb, the Worthy");
  assert.equal(creatureStats(commander), "2/2");
  assert.deepEqual(
    cardBadges({ ...commander, tapped: true, summoningSick: false, isToken: true, creature: { power: "*", toughness: "3", damage: 1 } }),
    ["getappt", "Token", "1 Schaden"],
  );
});

test("mana entries keep the WUBRGC order and append unknown symbols sorted", () => {
  assert.deepEqual(manaEntries({ white: 0, blue: 0, black: 1, red: 2, green: 0, colorless: 3, other: {} }), [
    { symbol: "B", amount: 1 },
    { symbol: "R", amount: 2 },
    { symbol: "C", amount: 3 },
  ]);
  assert.deepEqual(
    manaEntries({ white: 1, blue: 0, black: 0, red: 0, green: 0, colorless: 0, other: { X: 2, S: 1 } }),
    [{ symbol: "W", amount: 1 }, { symbol: "S", amount: 1 }, { symbol: "X", amount: 2 }],
  );
  const viewer = viewerSeatOf(view)!;
  assert.deepEqual(manaEntries(viewer.manaPool), []);
});

test("gameViewFromJson accepts StateUpdate messages, envelopes and raw gameViews", () => {
  const fromMessage = gameViewFromJson(JSON.stringify(stateUpdate));
  assert.equal(fromMessage.gameId, view.gameId);
  const fromEnvelope = gameViewFromJson(JSON.stringify(stateUpdate.state));
  assert.equal(fromEnvelope.gameId, view.gameId);
  const raw = (stateUpdate.state as { state: { gameView: unknown } }).state.gameView;
  const fromRaw = gameViewFromJson(JSON.stringify(raw));
  assert.equal(fromRaw.gameId, view.gameId);
  assert.equal(fromRaw.modelVersion, view.modelVersion);
});

test("gameViewFromJson rejects invalid input with user-facing errors", () => {
  assert.throws(() => gameViewFromJson("kein json"), /gueltiges JSON/);
  assert.throws(() => gameViewFromJson("[1,2,3]"), /JSON-Objekt/);
  assert.throws(() => gameViewFromJson("{}"), /StateUpdate-Nachricht/);
});