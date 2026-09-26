import assert from "node:assert/strict";
import {
  DECK_MODEL_VERSION,
  importCommanderDeck,
  parseCommanderDeckList,
  toManabrewCommanderDeck,
  toManabrewDeckSelection,
} from "../packages/shared/dist/deck-list.js";

// --- Happy path: Archidekt-style list with *CMDR* marker and printings -------

const uniqueSpells = Array.from({ length: 48 }, (_, index) => `1 Unique Spell ${index + 1}`);
const typicalList = [
  "Deck",
  "1 Neheb, the Worthy *CMDR*",
  "50x Mountain (AKR) 305",
  "1 Shock (MSC) 809",
  ...uniqueSpells,
  "",
  "Sideboard",
  "1 Fling",
].join("\n");

const meta = {
  owner: "Korbi",
  name: "Neheb Burn",
  sourceUrl: "https://example.com/decks/1",
  importedAt: "2026-09-26T10:00:00.000Z",
};

const parsed = parseCommanderDeckList(typicalList);
assert.deepEqual(parsed.issues, []);
assert.deepEqual(parsed.commanderNames, ["Neheb, the Worthy"]);
assert.equal(parsed.entries.length, 50);
assert.deepEqual(parsed.entries[0], { name: "Mountain", quantity: 50, setCode: "AKR", cardNumber: "305" });
assert.deepEqual(parsed.entries[1], { name: "Shock", quantity: 1, setCode: "MSC", cardNumber: "809" });
assert.deepEqual(parsed.sideboardEntries, [{ name: "Fling", quantity: 1, setCode: null, cardNumber: null }]);

const imported = importCommanderDeck(typicalList, meta);
assert.equal(imported.ok, true);
const deck = imported.deck;
assert.equal(deck.modelVersion, DECK_MODEL_VERSION);
assert.equal(deck.modelVersion, 1);
assert.equal(deck.owner, "Korbi");
assert.equal(deck.name, "Neheb Burn");
assert.equal(deck.sourceKind, "text");
assert.equal(deck.sourceUrl, "https://example.com/decks/1");
assert.equal(deck.importedAt, "2026-09-26T10:00:00.000Z");
assert.equal(deck.totalCardCount, 100);
assert.equal(deck.cards.length, 50);
assert.deepEqual(deck.commanders, [{ name: "Neheb, the Worthy", quantity: 1, setCode: null, cardNumber: null }]);

// --- Manabrew conversion (capture-proven format) -----------------------------

const manabrewDeck = toManabrewCommanderDeck(deck);
assert.equal(manabrewDeck.format, "commander");
assert.equal(manabrewDeck.name, "Neheb Burn");
assert.equal(manabrewDeck.cards.length, 99);
assert.equal(manabrewDeck.commanders.length, 1);
assert.deepEqual(manabrewDeck.commanders[0], {
  identity: { id: "neheb-the-worthy", name: "Neheb, the Worthy", setCode: "", cardNumber: "0" },
});
assert.deepEqual(manabrewDeck.cards[0], {
  identity: { id: "mountain-0", name: "Mountain", setCode: "AKR", cardNumber: "305" },
});
assert.equal(manabrewDeck.cards[49].identity.id, "mountain-49");
assert.equal(manabrewDeck.cards[50].identity.id, "shock-0");
assert.ok(manabrewDeck.cards[51].identity.id.startsWith("unique-spell-"));
assert.equal(manabrewDeck.cards[98].identity.id.startsWith("unique-spell-"), true);
assert.deepEqual(toManabrewCommanderDeck(deck), manabrewDeck); // deterministic

const selection = toManabrewDeckSelection(deck);
assert.equal(selection.deckName, "Neheb Burn");
assert.equal(selection.commanderName, "Neheb, the Worthy");
assert.equal(selection.publishedDeckId, null);
assert.equal(selection.avatarUrl, null);
assert.equal(selection.deck.cards.length, 99);

// --- Validation failures ------------------------------------------------------

const shortList = [
  "1 Neheb, the Worthy *CMDR*",
  "50x Mountain (AKR) 305",
  "48 Shock (MSC) 809",
].join("\n");
const shortResult = importCommanderDeck(shortList, meta);
assert.equal(shortResult.ok, false);
assert.ok(shortResult.issues.some((issue) => issue.message.includes("genau 100")));

const singletonList = [
  "1 Neheb, the Worthy *CMDR*",
  "2 Shock",
  "47 Fling",
  "50 Mountain",
].join("\n");
const singletonResult = importCommanderDeck(singletonList, meta);
assert.equal(singletonResult.ok, false);
assert.ok(singletonResult.issues.some((issue) => issue.message.includes("nur eine Kopie")));

const commanderDupList = [
  "Commander",
  "1 Neheb, the Worthy",
  "Deck",
  "1 Neheb, the Worthy",
  "50x Mountain (AKR) 305",
  "48 Shock (MSC) 809",
].join("\n");
const commanderDupResult = importCommanderDeck(commanderDupList, meta);
assert.equal(commanderDupResult.ok, false);
assert.ok(commanderDupResult.issues.some((issue) => issue.message.includes("zusaetzlich im 99er-Deck")));

const noCommanderResult = importCommanderDeck("99x Mountain", meta);
assert.equal(noCommanderResult.ok, false);
assert.ok(noCommanderResult.issues.some((issue) => issue.message.includes("Kein Commander erkannt")));

const tooManyCommanders = [
  "Commander",
  "1 A",
  "1 B",
  "1 C",
  "Deck",
  "97x Mountain",
].join("\n");
const tooManyResult = importCommanderDeck(tooManyCommanders, meta);
assert.equal(tooManyResult.ok, false);
assert.ok(tooManyResult.issues.some((issue) => issue.message.includes("Zu viele Commander (3)")));

// --- Partner commanders and commander named via meta --------------------------

const partnerList = [
  "Commander",
  "1 Vial Smasher the Fierce",
  "1 Kraum, Ludevic's Opus",
  "Deck",
  "98x Snow-Covered Mountain (MH1) 81",
].join("\n");
const partnerResult = importCommanderDeck(partnerList, meta);
assert.equal(partnerResult.ok, true);
assert.equal(partnerResult.deck.commanders.length, 2);
assert.equal(partnerResult.deck.totalCardCount, 100);
assert.equal(toManabrewCommanderDeck(partnerResult.deck).cards.length, 98);
assert.equal(toManabrewCommanderDeck(partnerResult.deck).commanders.length, 2);

// Commander inside the plain 99-card list, named via meta (common export shape).
const plainList = [
  "1 Neheb, the Worthy",
  ...Array.from({ length: 49 }, (_, index) => `1 Plain Spell ${index + 1}`),
  "50 Mountain",
].join("\n");
const plainResult = importCommanderDeck(plainList, { ...meta, commanderNames: ["Neheb, the Worthy"] });
assert.equal(plainResult.ok, true);
assert.equal(plainResult.deck.totalCardCount, 100);
assert.equal(plainResult.deck.cards.length, 50);
assert.equal(plainResult.deck.cards.every((entry) => entry.name !== "Neheb, the Worthy"), true);

// Line without quantity counts as 1x.
const noQuantity = parseCommanderDeckList("1 Neheb, the Worthy *CMDR*\nFling\n99x Mountain");
assert.deepEqual(noQuantity.entries[0], { name: "Fling", quantity: 1, setCode: null, cardNumber: null });

// --- Defensive input handling --------------------------------------------------

assert.throws(() => parseCommanderDeckList(42), TypeError);
assert.throws(() => importCommanderDeck(typicalList, { ...meta, owner: " " }), TypeError);
assert.throws(() => importCommanderDeck(typicalList, { ...meta, importedAt: "" }), TypeError);

console.log("deck-import-test: alle Assertions erfolgreich (DECK-001)");

