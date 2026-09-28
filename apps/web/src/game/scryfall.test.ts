import assert from "node:assert/strict";
import { test } from "node:test";
import type { UiCard } from "@mtg-commander/shared";
import { cardImageKey, cardPrintPath, pickImageUri } from "./scryfall.js";

function uiCard(overrides: Partial<UiCard> = {}): UiCard {
  return {
    id: "engine-card-2",
    name: "Victimize",
    visibility: "visible",
    ownerId: "player-0",
    controllerId: "player-0",
    tapped: false,
    creature: null,
    manaCost: "{2}{B}",
    cmc: 3,
    rulesText: null,
    colors: ["B"],
    types: ["Sorcery"],
    subtypes: [],
    supertypes: [],
    keywords: [],
    counters: {},
    summoningSick: false,
    faceDown: false,
    transformed: false,
    phasedOut: false,
    exerted: false,
    commanderTax: 0,
    isToken: false,
    setCode: "TDC",
    cardNumber: "198",
    ...overrides,
  };
}

test("cardPrintPath builds the exact-print path and falls back to null", () => {
  assert.equal(cardPrintPath(uiCard()), "tdc/198");
  assert.equal(cardPrintPath(uiCard({ setCode: null, cardNumber: null })), null);
  assert.equal(cardPrintPath(uiCard({ setCode: "", cardNumber: "" })), null);
});

test("cardImageKey is stable and case-insensitive", () => {
  assert.equal(cardImageKey(uiCard()), cardImageKey(uiCard({ setCode: "tdc" })));
  assert.equal(cardImageKey(uiCard({ name: "Swamp", setCode: null, cardNumber: null })), "swamp||");
});

test("pickImageUri prefers normal and falls back to front faces", () => {
  assert.equal(pickImageUri({ image_uris: { normal: "n", large: "l" } }), "n");
  assert.equal(pickImageUri({ image_uris: { large: "l" } }), "l");
  assert.equal(
    pickImageUri({ card_faces: [{ image_uris: { normal: "front" } }, { image_uris: { normal: "back" } }] }),
    "front",
  );
  assert.equal(pickImageUri({}), null);
});
