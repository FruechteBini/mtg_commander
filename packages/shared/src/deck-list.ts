/**
 * Neutral Commander deck list import (DECK-001).
 *
 * Parses typical plain-text Commander deck lists (Archidekt / MTGGoldfish /
 * mythic.tools copy-paste style) into a validated 100-card model and converts
 * it into the Manabrew deck format that was proven in the real capture
 * (`scripts/capture-real-session.mjs`):
 *
 * - deck: `{ name, format: "commander", cards: [{ identity }], commanders: [{ identity }] }`
 * - `cards` contains one entry per physical card (quantity is expanded),
 * - `setCode`/`cardNumber` degrade to `""`/`"0"` when the list has no printing,
 * - ids are deterministic slugs (`mountain-0`, `neheb-the-worthy`).
 *
 * Parsing and validation are pure: no clock access (`importedAt` is provided
 * by the caller), no randomness, and parse problems are collected as issues
 * instead of throwing (only non-string input throws, mirroring `game-view.ts`).
 *
 * Structural Commander rules enforced without a card database:
 * - exactly 100 cards including 1-2 commanders (partners),
 * - singleton rule with an exception for basic lands,
 * - commanders must not appear again in the 99.
 */

export const DECK_MODEL_VERSION = 1;

export interface DeckListCardEntry {
  name: string;
  quantity: number;
  setCode: string | null;
  cardNumber: string | null;
}

/** Imported deck model persisted by the app (DECK-001 data contract). */
export interface ImportedCommanderDeck {
  modelVersion: number;
  owner: string;
  name: string;
  commanders: DeckListCardEntry[];
  /** The 99 (commander excluded). */
  cards: DeckListCardEntry[];
  sourceKind: "text";
  sourceUrl: string | null;
  /** ISO timestamp supplied by the caller to keep this module pure. */
  importedAt: string;
  totalCardCount: number;
}

export interface DeckListIssue {
  /** 1-based source line, `0` for deck-level problems. */
  line: number;
  message: string;
}

export interface ParsedDeckList {
  /** Maindeck entries as written (quantities not expanded). */
  entries: DeckListCardEntry[];
  /** Entries found in sideboard/maybeboard sections; not part of the 99. */
  sideboardEntries: DeckListCardEntry[];
  /** Names recognized as commanders via section or `*CMDR*` marker. */
  commanderNames: string[];
  issues: DeckListIssue[];
}

export type ImportDeckResult =
  | { ok: true; deck: ImportedCommanderDeck }
  | { ok: false; issues: DeckListIssue[] };

const BASIC_LANDS = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "snow-covered plains",
  "snow-covered island",
  "snow-covered swamp",
  "snow-covered mountain",
  "snow-covered forest",
]);

const MAIN_SECTIONS = new Set(["deck", "main", "mainboard"]);
const COMMANDER_SECTIONS = new Set(["commander", "commanders"]);
const SIDE_SECTIONS = new Set(["sideboard", "maybeboard", "acquireboard"]);

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "card";
}

/**
 * Parses a raw deck list. Unknown sections are treated as maindeck lines so
 * real exports never fail hard; anything unparsable becomes an issue.
 */
export function parseCommanderDeckList(text: unknown): ParsedDeckList {
  if (typeof text !== "string") {
    throw new TypeError("Deckliste muss ein String sein.");
  }
  const result: ParsedDeckList = {
    entries: [],
    sideboardEntries: [],
    commanderNames: [],
    issues: [],
  };
  let section: "main" | "commander" | "side" = "main";
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!;
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#") || line.startsWith("//")) continue;
    const sectionKey = line.replace(/:$/, "").trim().toLowerCase();
    if (!/^\d/.test(line) && (MAIN_SECTIONS.has(sectionKey) || COMMANDER_SECTIONS.has(sectionKey) || SIDE_SECTIONS.has(sectionKey))) {
      section = COMMANDER_SECTIONS.has(sectionKey)
        ? "commander"
        : SIDE_SECTIONS.has(sectionKey)
          ? "side"
          : "main";
      continue;
    }
    const entry = parseEntry(line);
    if (entry === null) {
      result.issues.push({ line: index + 1, message: `Zeile nicht lesbar: "${line}"` });
      continue;
    }
    if (entry.quantity < 1) {
      result.issues.push({ line: index + 1, message: `Anzahl muss mindestens 1 sein: "${line}"` });
      continue;
    }
    if (entry.name.length === 0) {
      result.issues.push({ line: index + 1, message: `Kartenname fehlt: "${line}"` });
      continue;
    }
    if (section === "commander" || entry.isCommander) {
      if (!result.commanderNames.includes(entry.name)) result.commanderNames.push(entry.name);
      continue;
    }
    const target = section === "side" ? result.sideboardEntries : result.entries;
    target.push({
      name: entry.name,
      quantity: entry.quantity,
      setCode: entry.setCode,
      cardNumber: entry.cardNumber,
    });
  }
  return result;
}

interface ParsedEntry {
  name: string;
  quantity: number;
  setCode: string | null;
  cardNumber: string | null;
  isCommander: boolean;
}

const QUANTITY_PATTERN = /^(\d+)\s*[xX]?\s+(.*)$/;
const PRINTING_PATTERN = /\s*\(([A-Z0-9]{3,6})\)(?:\s+(\S+))?$/;

function parseEntry(line: string): ParsedEntry | null {
  let rest = line;
  let isCommander = false;
  if (rest.includes("*CMDR*")) {
    isCommander = true;
    rest = rest.replace(/\*CMDR\*/g, "");
  }
  let quantity = 1;
  const quantityMatch = QUANTITY_PATTERN.exec(rest.trim());
  if (quantityMatch !== null) {
    quantity = Number(quantityMatch[1]);
    rest = quantityMatch[2] ?? "";
  }
  let setCode: string | null = null;
  let cardNumber: string | null = null;
  const printingMatch = PRINTING_PATTERN.exec(rest.trim());
  if (printingMatch !== null) {
    setCode = printingMatch[1] ?? null;
    cardNumber = printingMatch[2] ?? null;
    rest = rest.slice(0, rest.length - printingMatch[0].length);
  }
  const name = rest.replace(/\s{2,}/g, " ").trim();
  if (name.length === 0 && quantityMatch === null) return null;
  return { name, quantity, setCode, cardNumber, isCommander };
}

/** Structural Commander validation. Returns all issues at once. */
export function validateCommanderDeck(
  parsed: ParsedDeckList,
  commanders: DeckListCardEntry[],
): DeckListIssue[] {
  const issues: DeckListIssue[] = [];
  if (commanders.length === 0) {
    issues.push({ line: 0, message: "Kein Commander erkannt (Commander-Sektion oder *CMDR* fehlt)." });
  }
  if (commanders.length > 2) {
    issues.push({ line: 0, message: `Zu viele Commander (${commanders.length}); erlaubt sind 1-2 (Partner).` });
  }
  const commanderNames = new Set(commanders.map((commander) => normalizeName(commander.name)));
  if (commanderNames.size !== commanders.length) {
    issues.push({ line: 0, message: "Commander-Namen sind doppelt vorhanden." });
  }
  const quantities = new Map<string, number>();
  for (const entry of parsed.entries) {
    const key = normalizeName(entry.name);
    quantities.set(key, (quantities.get(key) ?? 0) + entry.quantity);
    if (commanderNames.has(key)) {
      issues.push({ line: 0, message: `"${entry.name}" ist Commander und darf nicht zusaetzlich im 99er-Deck stehen.` });
    }
  }
  for (const [key, quantity] of [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (quantity > 1 && !BASIC_LANDS.has(key)) {
      issues.push({ line: 0, message: `"${key}" ist ${quantity}x vorhanden; Commander erlaubt nur eine Kopie (ausser Basiscards).` });
    }
  }
  const total = parsed.entries.reduce((sum, entry) => sum + entry.quantity, 0)
    + commanders.reduce((sum, entry) => sum + entry.quantity, 0);
  if (total !== 100) {
    issues.push({
      line: 0,
      message: `Deck hat ${total} Karten inklusive Commander; benoetigt werden genau 100.`,
    });
  }
  return issues;
}

export interface ImportDeckMeta {
  owner: string;
  name?: string;
  /** Commander names for lists without markers; overrides parsed names. */
  commanderNames?: string[];
  sourceUrl?: string | null;
  /** ISO timestamp; required so the import stays deterministic and testable. */
  importedAt: string;
}

/** Parses, validates and builds the persisted deck model in one step. */
export function importCommanderDeck(text: unknown, meta: ImportDeckMeta): ImportDeckResult {
  if (typeof meta.owner !== "string" || meta.owner.trim().length === 0) {
    throw new TypeError("Besitzer fehlt fuer den Deckimport.");
  }
  if (typeof meta.importedAt !== "string" || meta.importedAt.trim().length === 0) {
    throw new TypeError("Importzeitpunkt (ISO) fehlt fuer den Deckimport.");
  }
  const parsed = parseCommanderDeckList(text);
  const metaNames = meta.commanderNames !== undefined && meta.commanderNames.length > 0
    ? meta.commanderNames
    : null;
  const names = metaNames ?? parsed.commanderNames;
  const useMetaNames = metaNames !== null;
  const commanders: DeckListCardEntry[] = names.map((name) => {
    const inDeck = parsed.entries.find((entry) => entry.name === name);
    return {
      name,
      quantity: 1,
      setCode: inDeck?.setCode ?? null,
      cardNumber: inDeck?.cardNumber ?? null,
    };
  });
  // Commanders named by the caller are pulled out of a plain 99-card list;
  // commanders already marked as such must not appear in the deck again.
  const entries = useMetaNames
    ? parsed.entries.filter((entry) => !names.includes(entry.name))
    : parsed.entries;
  const issues = [...parsed.issues, ...validateCommanderDeck({ ...parsed, entries }, commanders)];
  if (issues.length > 0) return { ok: false, issues };
  const totalCardCount = entries.reduce((sum, entry) => sum + entry.quantity, 0)
    + commanders.reduce((sum, entry) => sum + entry.quantity, 0);
  return {
    ok: true,
    deck: {
      modelVersion: DECK_MODEL_VERSION,
      owner: meta.owner.trim(),
      name: meta.name !== undefined && meta.name.trim().length > 0 ? meta.name.trim() : "Unbenanntes Deck",
      commanders,
      cards: entries,
      sourceKind: "text",
      sourceUrl: meta.sourceUrl ?? null,
      importedAt: meta.importedAt,
      totalCardCount,
    },
  };
}



// ---------------------------------------------------------------------------
// Manabrew deck conversion (format proven by the real capture)
// ---------------------------------------------------------------------------

export interface ManabrewCardEntry {
  identity: {
    id: string;
    name: string;
    setCode: string;
    cardNumber: string;
  };
}

export interface ManabrewCommanderDeck {
  name: string;
  format: "commander";
  /** One entry per physical card (quantity expanded). */
  cards: ManabrewCardEntry[];
  commanders: ManabrewCardEntry[];
}

/** Deck selection payload accepted by the relay client's `setDeckSelection`. */
export interface ManabrewDeckSelection {
  deckName: string;
  deck: ManabrewCommanderDeck;
  publishedDeckId: string | null;
  commanderName: string;
  avatarUrl: string | null;
}

/** Converts the imported model into the Manabrew deck shape (deterministic). */
export function toManabrewCommanderDeck(deck: ImportedCommanderDeck): ManabrewCommanderDeck {
  const cards: ManabrewCardEntry[] = [];
  const sorted = [...deck.cards].sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    for (let index = 0; index < entry.quantity; index += 1) {
      cards.push({
        identity: {
          id: `${slugify(entry.name)}-${index}`,
          name: entry.name,
          setCode: entry.setCode ?? "",
          cardNumber: entry.cardNumber ?? "0",
        },
      });
    }
  }
  const commanders = deck.commanders.map((commander) => ({
    identity: {
      id: slugify(commander.name),
      name: commander.name,
      setCode: commander.setCode ?? "",
      cardNumber: commander.cardNumber ?? "0",
    },
  }));
  return { name: deck.name, format: "commander", cards, commanders };
}

/** Full selection payload, mirroring `captureDeckSelection()` from the capture script. */
export function toManabrewDeckSelection(deck: ImportedCommanderDeck): ManabrewDeckSelection {
  return {
    deckName: deck.name,
    deck: toManabrewCommanderDeck(deck),
    publishedDeckId: null,
    commanderName: deck.commanders[0]?.name ?? "",
    avatarUrl: null,
  };
}
