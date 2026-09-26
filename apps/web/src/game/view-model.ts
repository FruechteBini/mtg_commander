import type {
  GameViewDto,
  NormalizedGameView,
  StateEnvelope,
  UiCard,
  UiManaPool,
  UiPhase,
  UiPlayerSeat,
  UiTurnInfo,
  UiZone,
  UiZoneKind,
} from "@mtg-commander/shared";
import { normalizeGameView, normalizeStateEnvelope } from "@mtg-commander/shared";

const ZONE_LABELS: Record<UiZoneKind, string> = {
  battlefield: "Schlachtfeld",
  hand: "Hand",
  library: "Bibliothek",
  graveyard: "Friedhof",
  exile: "Exil",
  command: "Kommandozone",
  unknown: "Unbekannte Zone",
};

const PHASE_LABELS: Record<UiPhase, string> = {
  beginning: "Beginn",
  precombatMain: "Hauptphase vor Kampf",
  combat: "Kampf",
  postcombatMain: "Hauptphase nach Kampf",
  end: "Endphase",
  unknown: "Unbekannte Phase",
};

const MANA_SYMBOLS: ReadonlyArray<["white" | "blue" | "black" | "red" | "green" | "colorless", string]> = [
  ["white", "W"],
  ["blue", "U"],
  ["black", "B"],
  ["red", "R"],
  ["green", "G"],
  ["colorless", "C"],
];

export function zoneLabel(kind: UiZoneKind): string {
  return ZONE_LABELS[kind];
}

export function phaseLabel(phase: UiPhase): string {
  return PHASE_LABELS[phase];
}

export function turnHeadline(turn: UiTurnInfo): string {
  return `Zug ${turn.displayTurn} \u00b7 ${PHASE_LABELS[turn.phase]}`;
}

export function playerDisplayName(player: UiPlayerSeat, viewerId: string | null): string {
  if (player.id === viewerId) return "Du";
  return player.name.trim().length > 0 ? player.name : `Spieler ${player.seat + 1}`;
}

export function roleBadges(player: UiPlayerSeat): string[] {
  const badges: string[] = [player.isHuman ? "Mensch" : "Bot"];
  if (player.isActive) badges.push("aktiv");
  if (player.hasPriority) badges.push("Prioritaet");
  if (player.isMonarch) badges.push("Monarch");
  if (player.hasInitiative) badges.push("Initiative");
  if (player.hasCityBlessing) badges.push("Stadtsegen");
  if (player.isExtraTurn) badges.push("Extra-Zug");
  return badges;
}

export function cardTitle(card: UiCard): string {
  return card.name ?? `Karte ${card.id}`;
}

export function creatureStats(card: UiCard): string | null {
  if (!card.creature) return null;
  return `${card.creature.power ?? "?"}/${card.creature.toughness ?? "?"}`;
}

export function cardBadges(card: UiCard): string[] {
  const badges: string[] = [];
  if (card.tapped) badges.push("getappt");
  if (card.summoningSick) badges.push("aufrufkrank");
  if (card.faceDown) badges.push("verdeckt");
  if (card.transformed) badges.push("transformiert");
  if (card.phasedOut) badges.push("ausgephast");
  if (card.exerted) badges.push("angestrengt");
  if (card.isToken) badges.push("Token");
  if (card.commanderTax > 0) badges.push(`Steuer ${card.commanderTax}`);
  if (card.creature && card.creature.damage > 0) badges.push(`${card.creature.damage} Schaden`);
  for (const [key, amount] of Object.entries(card.counters)) badges.push(`${amount}x ${key}`);
  return badges;
}

export function manaEntries(pool: UiManaPool): Array<{ symbol: string; amount: number }> {
  const entries = MANA_SYMBOLS.filter(([key]) => pool[key] > 0).map(([key, symbol]) => ({ symbol, amount: pool[key] }));
  const otherEntries = Object.entries(pool.other)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [symbol, amount] of otherEntries) entries.push({ symbol, amount });
  return entries;
}

export function zoneCountText(zone: UiZone): string {
  if (zone.hidden) return `verdeckt \u00b7 ${zone.reportedCount} Karten`;
  return zone.reportedCount === 1 ? "1 Karte" : `${zone.reportedCount} Karten`;
}

export function viewerPlayerId(view: NormalizedGameView): string | null {
  if (view.forPlayerId) return view.forPlayerId;
  const human = view.players.find((player) => player.isHuman);
  return human?.id ?? view.players[0]?.id ?? null;
}

export function viewerSeatOf(view: NormalizedGameView): UiPlayerSeat | null {
  const viewerId = viewerPlayerId(view);
  return view.players.find((player) => player.id === viewerId) ?? null;
}

export function opponentsOf(view: NormalizedGameView): UiPlayerSeat[] {
  const viewerId = viewerPlayerId(view);
  return view.players.filter((player) => player.id !== viewerId);
}

/**
 * Accepts a pasted capture fragment: a full `StateUpdate` relay message,
 * a bare state envelope, or a raw `gameView` object. Anything else throws
 * with a user-facing German message.
 */
export function gameViewFromJson(text: string): NormalizedGameView {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Eingabe ist kein gueltiges JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Eingabe ist kein JSON-Objekt.");
  }
  const record = parsed as Record<string, unknown>;

  if (record.type === "StateUpdate" && record.state !== null && typeof record.state === "object") {
    return normalizeStateEnvelope(record.state as unknown as StateEnvelope);
  }
  if (record.kind === "state") {
    return normalizeStateEnvelope(record as unknown as StateEnvelope);
  }
  if (typeof record.gameId === "string" && Array.isArray(record.players)) {
    return normalizeGameView(record as unknown as GameViewDto);
  }
  throw new Error("Erwartet wird eine StateUpdate-Nachricht, ein State-Envelope oder ein gameView-Objekt.");
}