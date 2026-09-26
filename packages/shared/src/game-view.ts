/**
 * Normalized, stable UI model for real Manabrew `gameView` states (UI-001).
 *
 * The engine stays authoritative; this module only projects a validated
 * `GameViewDto` into a deterministic shape the React app can render without
 * knowing Manabrew field names. Normalization is pure:
 *
 * - no timestamps, randomness, or ambient state,
 * - object maps are converted to sorted arrays so JSON output is stable
 *   even when the engine reorders keys,
 * - unknown steps, zones, mana symbols, or fields degrade to explicit
 *   fallbacks (`unknown`, `other`) instead of throwing.
 *
 * Observed protocol facts this mapping is based on:
 * - zones seen in real captures: hand, graveyard, exile, command, library, battlefield,
 * - hidden zones may report `count > 0` while `cards` stays empty,
 * - steps seen in real captures: untap, upkeep, draw, main1, combatBegin,
 *   combatDeclareAttackers, combatEnd, main2, endOfTurn,
 * - `turn` is zero-based (`turn: 0` is the first turn of the game),
 * - mana pool keys seen: W, U, B, R, G, C.
 */

import type {
  CardViewDto,
  GameViewDto,
  PlayerDto,
  PlayerId,
  StackObjectDto,
  StateEnvelope,
  ZoneDto,
} from "./manabrew-protocol.js";

export const UI_MODEL_VERSION = 1;

export type UiZoneKind =
  | "battlefield"
  | "hand"
  | "library"
  | "graveyard"
  | "exile"
  | "command"
  | "unknown";

export type UiCardVisibility = "visible" | "hidden" | "redacted" | "unknown";

export type UiPhase =
  | "beginning"
  | "precombatMain"
  | "combat"
  | "postcombatMain"
  | "end"
  | "unknown";

export interface UiManaPool {
  white: number;
  blue: number;
  black: number;
  red: number;
  green: number;
  colorless: number;
  /** Mana symbols outside the observed W/U/B/R/G/C set, sorted by symbol. */
  other: Record<string, number>;
}

export interface UiCommanderCastEntry {
  cardId: string;
  casts: number;
}

export interface UiCommanderDamageEntry {
  fromPlayerId: PlayerId;
  damage: number;
}

export interface UiCreatureState {
  power: string | null;
  toughness: string | null;
  damage: number;
}

export interface UiCard {
  id: string;
  name: string | null;
  visibility: UiCardVisibility;
  ownerId: PlayerId | null;
  controllerId: PlayerId | null;
  tapped: boolean;
  creature: UiCreatureState | null;
  manaCost: string | null;
  cmc: number | null;
  /** Color symbols from the observed `color` string, e.g. "BR" -> ["B", "R"], sorted. */
  colors: string[];
  types: string[];
  subtypes: string[];
  supertypes: string[];
  keywords: string[];
  counters: Record<string, number>;
  summoningSick: boolean;
  faceDown: boolean;
  transformed: boolean;
  phasedOut: boolean;
  exerted: boolean;
  commanderTax: number;
  isToken: boolean;
  setCode: string | null;
  cardNumber: string | null;
}

export interface UiZone {
  kind: UiZoneKind;
  /** Raw engine zone name, preserved for unknown zones. */
  rawName: string;
  ownerId: PlayerId | null;
  /** Number of card entries the viewer is allowed to see. */
  knownCount: number;
  /** Count reported by the engine (can exceed knownCount in hidden zones). */
  reportedCount: number;
  /** True when the engine withheld at least one card from this viewer. */
  hidden: boolean;
  cards: UiCard[];
}

export interface UiPlayerZoneGroup {
  playerId: PlayerId;
  zones: UiZone[];
}

export interface UiStackTarget {
  id: string;
  kind: string;
}

export interface UiStackEntry {
  id: string;
  name: string | null;
  controllerId: PlayerId | null;
  targets: UiStackTarget[];
}

export interface UiTurnInfo {
  /** Raw engine turn counter, zero-based as observed. */
  turn: number;
  /** Human-facing turn number (turn + 1). */
  displayTurn: number;
  /** Raw engine step id, e.g. "combatDeclareAttackers". */
  step: string;
  phase: UiPhase;
}

export interface UiCombatView {
  /** True while the current phase belongs to the combat phase. */
  combatPhaseActive: boolean;
  /**
   * Raw `combatAssignments` entries. Only an empty array has been observed in
   * real captures so far; entries are passed through untouched instead of guessed.
   */
  assignments: unknown[];
}

export interface UiSpecialRoles {
  monarchId: PlayerId | null;
  initiativeHolderId: PlayerId | null;
  dayTime: "day" | "night" | "neither" | "unknown";
  /** Active plane names; null was observed for normal games and becomes []. */
  activePlaneNames: string[];
}

export interface UiPlayerSeat {
  id: PlayerId;
  name: string;
  /** Seat index in engine player order (turn order). */
  seat: number;
  life: number;
  status: string;
  isHuman: boolean;
  isActive: boolean;
  hasPriority: boolean;
  isMonarch: boolean;
  hasInitiative: boolean;
  hasCityBlessing: boolean;
  isExtraTurn: boolean;
  manaPool: UiManaPool;
  maxHandSize: number;
  cardsDrawnThisTurn: number;
  landsPlayedThisTurn: number;
  maxLandPlaysPerTurn: number;
  unlimitedLandPlays: boolean;
  /** Commander cast counts, sorted by card id. */
  commanderCasts: UiCommanderCastEntry[];
  /** Commander damage taken, sorted by attacking player id. Empty as observed. */
  commanderDamage: UiCommanderDamageEntry[];
  playerKeywords: string[];
  counters: Record<string, number>;
}

export interface NormalizedGameView {
  modelVersion: typeof UI_MODEL_VERSION;
  gameId: string;
  /** Player the engine projected this view for; null when the envelope omitted it. */
  forPlayerId: PlayerId | null;
  playerCount: number;
  players: UiPlayerSeat[];
  /** Zones grouped per player, in engine seat order, fixed zone order per group. */
  playerZones: UiPlayerZoneGroup[];
  /** Zones whose owner is not a known player. Empty with the current engine. */
  sharedZones: UiZone[];
  stack: UiStackEntry[];
  turn: UiTurnInfo;
  combat: UiCombatView;
  specialRoles: UiSpecialRoles;
  activePlayerId: PlayerId | null;
  priorityPlayerId: PlayerId | null;
  gameOver: boolean;
  winnerId: PlayerId | null;
}

export interface NormalizeGameViewOptions {
  forPlayerId?: PlayerId | null;
}

const ZONE_ORDER: ReadonlyArray<UiZoneKind> = [
  "battlefield",
  "hand",
  "library",
  "graveyard",
  "exile",
  "command",
];

const ZONE_KINDS = new Set<string>(ZONE_ORDER);

const STEP_PHASES: Readonly<Record<string, UiPhase>> = {
  untap: "beginning",
  upkeep: "beginning",
  draw: "beginning",
  main1: "precombatMain",
  combatBegin: "combat",
  combatDeclareAttackers: "combat",
  combatEnd: "combat",
  main2: "postcombatMain",
  endOfTurn: "end",
};

const MANA_KEYS: Readonly<Record<string, keyof Omit<UiManaPool, "other">>> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
  C: "colorless",
};

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asPlayerId(value: unknown): PlayerId | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asCounters(value: unknown): Record<string, number> {
  const counters: Record<string, number> = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) return counters;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).sort()) {
    const amount = record[key];
    if (typeof amount === "number" && Number.isFinite(amount)) counters[key] = amount;
  }
  return counters;
}

function normalizeVisibility(value: unknown): UiCardVisibility {
  return value === "visible" || value === "hidden" || value === "redacted" ? value : "unknown";
}

function normalizeManaPool(value: unknown): UiManaPool {
  const pool: UiManaPool = {
    white: 0,
    blue: 0,
    black: 0,
    red: 0,
    green: 0,
    colorless: 0,
    other: {},
  };
  if (value === null || typeof value !== "object" || Array.isArray(value)) return pool;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const amount = record[key];
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) continue;
    const known = MANA_KEYS[key];
    if (known) pool[known] = amount;
    else pool.other[key] = amount;
  }
  pool.other = Object.fromEntries(
    Object.entries(pool.other).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return pool;
}

function normalizeCommanderCasts(value: unknown): UiCommanderCastEntry[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .filter((cardId) => typeof record[cardId] === "number" && Number.isFinite(record[cardId]))
    .sort()
    .map((cardId) => ({ cardId, casts: record[cardId] as number }));
}

function normalizeCommanderDamage(value: unknown): UiCommanderDamageEntry[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .filter((playerId) => typeof record[playerId] === "number" && Number.isFinite(record[playerId]))
    .sort()
    .map((playerId) => ({ fromPlayerId: playerId, damage: record[playerId] as number }));
}

function normalizeCard(card: CardViewDto, fallbackIndex: number): UiCard {
  const identity = (card.identity ?? null) as Record<string, unknown> | null;
  const types = asStringArray(card.types);
  const isCreature = types.includes("Creature");

  return {
    id: typeof card.id === "string" && card.id.length > 0 ? card.id : `card-${fallbackIndex}`,
    name: identity !== null && typeof identity.name === "string" ? identity.name : null,
    visibility: normalizeVisibility(card.visibility),
    ownerId: asPlayerId(card.ownerId),
    controllerId: asPlayerId(card.controllerId),
    tapped: asBoolean(card.tapped),
    creature: isCreature
      ? {
          power: asNullableString(card.power),
          toughness: asNullableString(card.toughness),
          damage: asNumber(card.damage),
        }
      : null,
    manaCost: asNullableString(card.manaCost),
    cmc: typeof card.cmc === "number" && Number.isFinite(card.cmc) ? card.cmc : null,
    colors: typeof card.color === "string" ? [...card.color].sort() : [],
    types,
    subtypes: asStringArray(card.subtypes),
    supertypes: asStringArray(card.supertypes),
    keywords: asStringArray(card.keywords),
    counters: asCounters(card.counters),
    summoningSick: asBoolean(card.summoningSick),
    faceDown: asBoolean(card.isFaceDown),
    transformed: asBoolean(card.isTransformed),
    phasedOut: asBoolean(card.phasedOut),
    exerted: asBoolean(card.exerted),
    commanderTax: asNumber(card.commanderTax),
    isToken: identity !== null && identity.isToken === true,
    setCode: identity !== null ? asNullableString(identity.setCode) : null,
    cardNumber: identity !== null ? asNullableString(identity.cardNumber) : null,
  };
}

function zoneSortKey(zone: UiZone): number {
  return zone.kind === "unknown" ? ZONE_ORDER.length : ZONE_ORDER.indexOf(zone.kind);
}

function normalizeZone(zone: ZoneDto): UiZone {
  const cards = Array.isArray(zone.cards) ? zone.cards : [];
  const knownCount = cards.length;
  const reportedRaw = typeof zone.count === "number" && Number.isFinite(zone.count) ? zone.count : knownCount;
  const reportedCount = Math.max(reportedRaw, knownCount);

  return {
    kind: ZONE_KINDS.has(zone.zone) ? (zone.zone as UiZoneKind) : "unknown",
    rawName: zone.zone,
    ownerId: asPlayerId(zone.ownerId),
    knownCount,
    reportedCount,
    hidden: knownCount < reportedCount,
    cards: cards.map((card, index) => normalizeCard(card, index)),
  };
}

function normalizeStackEntry(entry: StackObjectDto, index: number): UiStackEntry {
  const source = (entry.source ?? null) as CardViewDto | null;
  const identity = source?.identity ?? null;
  const targets = Array.isArray(entry.targets) ? entry.targets : [];

  return {
    id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `stack-${index}`,
    name: identity !== null && typeof identity.name === "string" ? identity.name : null,
    controllerId: asPlayerId(entry.controllerId),
    targets: targets
      .filter((target) => typeof target.id === "string")
      .map((target) => ({ id: target.id, kind: typeof target.kind === "string" ? target.kind : "unknown" })),
  };
}

function normalizePlayer(player: PlayerDto, seat: number, view: GameViewDto): UiPlayerSeat {
  const monarchId = asPlayerId(view.monarchId);
  const initiativeHolderId = asPlayerId(view.initiativeHolderId);
  const activePlayerId = asPlayerId(view.activePlayerId);
  const priorityPlayerId = asPlayerId(view.priorityPlayerId);

  return {
    id: player.id,
    name: player.name,
    seat,
    life: asNumber(player.life),
    status: typeof player.status === "string" ? player.status : "unknown",
    isHuman: asBoolean(player.isHuman),
    isActive: activePlayerId === player.id,
    hasPriority: priorityPlayerId === player.id,
    isMonarch: monarchId === player.id,
    hasInitiative: initiativeHolderId === player.id,
    hasCityBlessing: asBoolean(player.hasCityBlessing),
    isExtraTurn: asBoolean(player.isExtraTurn),
    manaPool: normalizeManaPool(player.manaPool),
    maxHandSize: asNumber(player.maxHandSize),
    cardsDrawnThisTurn: asNumber(player.cardsDrawnThisTurn),
    landsPlayedThisTurn: asNumber(player.landsPlayedThisTurn),
    maxLandPlaysPerTurn: asNumber(player.maxLandPlaysPerTurn),
    unlimitedLandPlays: asBoolean(player.unlimitedLandPlays),
    commanderCasts: normalizeCommanderCasts(player.commanderCasts),
    commanderDamage: normalizeCommanderDamage(player.commanderDamage),
    playerKeywords: asStringArray(player.playerKeywords),
    counters: asCounters(player.counters),
  };
}

function normalizeTurn(view: GameViewDto): UiTurnInfo {
  const turn = asNumber(view.turn);
  const step = typeof view.step === "string" ? view.step : "unknown";

  return {
    turn,
    displayTurn: turn + 1,
    step,
    phase: STEP_PHASES[step] ?? "unknown",
  };
}

function normalizeSpecialRoles(view: GameViewDto): UiSpecialRoles {
  const dayTime = view.dayTime;

  return {
    monarchId: asPlayerId(view.monarchId),
    initiativeHolderId: asPlayerId(view.initiativeHolderId),
    dayTime: dayTime === "day" || dayTime === "night" || dayTime === "neither" ? dayTime : "unknown",
    activePlaneNames: asStringArray(view.activePlaneNames),
  };
}

/**
 * Projects a validated `GameViewDto` into the stable UI model.
 * The function is total for valid DTOs: malformed optional fields degrade to
 * explicit fallbacks, it never throws for missing optional data, and repeated
 * calls with equal input (regardless of object key order) produce deep-equal output.
 */
export function normalizeGameView(
  dto: GameViewDto,
  options: NormalizeGameViewOptions = {},
): NormalizedGameView {
  if (dto === null || typeof dto !== "object") {
    throw new TypeError("normalizeGameView expects a gameView object");
  }

  const players = Array.isArray(dto.players) ? dto.players : [];
  const seats = players.map((player, seat) => normalizePlayer(player, seat, dto));
  const knownPlayerIds = new Set<PlayerId>(seats.map((seat) => seat.id));

  const zones = (Array.isArray(dto.zones) ? dto.zones : []).map(normalizeZone);
  const playerZones: UiPlayerZoneGroup[] = [];
  const sharedZones: UiZone[] = [];

  for (const seat of seats) {
    playerZones.push({
      playerId: seat.id,
      zones: zones
        .filter((zone) => zone.ownerId === seat.id)
        .sort((a, b) => {
          const order = zoneSortKey(a) - zoneSortKey(b);
          return order !== 0 ? order : (a.rawName < b.rawName ? -1 : a.rawName > b.rawName ? 1 : 0);
        }),
    });
  }
  for (const zone of zones) {
    if (zone.ownerId === null || !knownPlayerIds.has(zone.ownerId)) sharedZones.push(zone);
  }

  const turn = normalizeTurn(dto);

  return {
    modelVersion: UI_MODEL_VERSION,
    gameId: dto.gameId,
    forPlayerId: options.forPlayerId ?? null,
    playerCount: seats.length,
    players: seats,
    playerZones,
    sharedZones,
    stack: (Array.isArray(dto.stack) ? dto.stack : []).map((entry, index) => normalizeStackEntry(entry, index)),
    turn,
    combat: {
      combatPhaseActive: turn.phase === "combat",
      assignments: Array.isArray(dto.combatAssignments) ? dto.combatAssignments : [],
    },
    specialRoles: normalizeSpecialRoles(dto),
    activePlayerId: asPlayerId(dto.activePlayerId),
    priorityPlayerId: asPlayerId(dto.priorityPlayerId),
    gameOver: asBoolean(dto.gameOver),
    winnerId: asPlayerId(dto.winnerId),
  };
}

/**
 * Normalizes the `state` envelope emitted by the engine after relay transport.
 * Throws for non-`state` envelopes because those never contain a `gameView`.
 */
export function normalizeStateEnvelope(envelope: StateEnvelope): NormalizedGameView {
  if (envelope === null || typeof envelope !== "object" || envelope.kind !== "state") {
    throw new TypeError("normalizeStateEnvelope expects a state envelope");
  }

  return normalizeGameView(envelope.state.gameView, { forPlayerId: envelope.forPlayer ?? null });
}




