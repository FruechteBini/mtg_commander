import type { AgentPrompt, AvailableAction } from "@mtg-commander/shared";

/**
 * UI-003: turn relay prompts into clickable, engine-legal answer options.
 * Pure logic (no React) so it stays unit-testable; response payloads follow
 * the proven prompt families from the BOT-002 long runs.
 */

export interface PromptOption {
  id: string;
  label: string;
  detail: string | null;
  kind: "act" | "pass" | "pay" | "cancel" | "confirm";
  primary: boolean;
  actionType: string;
  output: Record<string, unknown>;
}

export interface TargetCandidate {
  id: string;
  kind: string;
}

export interface CardChoice {
  id: string;
  name: string | null;
}

const HEADLINES: Record<string, string> = {
  chooseAction: "Aktion waehlen",
  payManaCost: "Mana bezahlen",
  mulligan: "Mulligan",
  mulliganPutBack: "Karten zuruecklegen",
  chooseBoardTargets: "Ziele waehlen",
  chooseCards: "Karten waehlen",
  chooseBoolean: "Entscheidung",
  diceRolled: "Wuerfelwurf",
  revealCards: "Karten zeigen",
  scry: "Scry",
  reorder: "Reihenfolge",
};

const CONFIRM_OUTPUTS: Record<string, Record<string, unknown>> = {
  diceRolled: { type: "diceRolledAcknowledged" },
  revealCards: { type: "revealCardsAcknowledged" },
};

export function promptHeadline(prompt: AgentPrompt): string {
  return HEADLINES[prompt.input.type] ?? `Prompt: ${prompt.input.type}`;
}

export function promptSourceText(prompt: AgentPrompt): string | null {
  const candidates = [prompt.sourceCard?.name ?? null, prompt.sourceAbilityText ?? null];
  const parts = candidates.filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" \u00b7 ") : null;
}

function isPrimaryAction(action: AvailableAction): boolean {
  if (action.type === "playLand") return true;
  return /^Play\s/i.test(action.label ?? "");
}

function option(
  prompt: AgentPrompt,
  id: string,
  label: string,
  kind: PromptOption["kind"],
  output: Record<string, unknown>,
  options: { detail?: string | null; primary?: boolean } = {},
): PromptOption {
  return {
    id,
    label,
    detail: options.detail ?? null,
    kind,
    primary: options.primary ?? false,
    actionType: prompt.input.type,
    output,
  };
}

function chooseActionOptions(prompt: AgentPrompt): PromptOption[] {
  const input = prompt.input as { type: "chooseAction"; actions: AvailableAction[] };
  const actions = Array.isArray(input.actions) ? input.actions : [];
  const options = actions.map((action, index) =>
    option(
      prompt,
      `action-${action.id ?? index}`,
      action.label ?? action.type,
      "act",
      { type: "act", actionId: action.id },
      { detail: action.type, primary: isPrimaryAction(action) },
    ),
  );
  options.push(option(prompt, "pass", "Passen", "pass", { type: "pass", exhaustStack: false }));
  return options;
}

function payManaOptions(prompt: AgentPrompt): PromptOption[] {
  const input = prompt.input as {
    type: "payManaCost";
    actions: AvailableAction[];
    canConfirmFromPool: boolean;
    manaCost?: string;
  };
  const options: PromptOption[] = [];
  if (input.canConfirmFromPool) {
    options.push(
      option(prompt, "pay-pool", "Aus Mana-Pool bezahlen", "pay", { type: "pay", auto: false }, {
        detail: input.manaCost ?? null,
        primary: true,
      }),
    );
  }
  const actions = Array.isArray(input.actions) ? input.actions : [];
  for (const [index, action] of actions.entries()) {
    options.push(
      option(prompt, `mana-${action.id ?? index}`, action.label ?? "Mana-Faehigkeit", "act", {
        type: "act",
        actionId: action.id,
      }, { detail: action.type }),
    );
  }
  options.push(option(prompt, "cancel", "Abbrechen", "cancel", { type: "cancel" }));
  return options;
}

/** Default answers for prompt families without a selection UI in increment 1. */
function defaultAnswerOptions(prompt: AgentPrompt): PromptOption[] {
  const input = prompt.input as Record<string, unknown>;
  const type = prompt.input.type;

  if (type === "mulligan") {
    return [
      option(prompt, "keep", "Hand behalten", "confirm", { type: "mulliganDecision", keep: true }, { primary: true }),
      option(prompt, "mulligan", "Mullegen", "confirm", { type: "mulliganDecision", keep: false }),
    ];
  }
  if (type === "mulliganPutBack") {
    const handCardIds = Array.isArray(input.handCardIds) ? (input.handCardIds as Array<{ id: string }>) : [];
    const count = typeof input.count === "number" ? input.count : 0;
    const cardIds = handCardIds.slice(0, count).map((card) => card.id);
    return [
      option(prompt, "put-back", `${cardIds.length} Karten zuruecklegen (Standard)`, "confirm", {
        type: "mulliganPutBackDecision",
        cardIds,
      }, { primary: true }),
    ];
  }
  if (type === "chooseBoolean") {
    return [
      option(prompt, "yes", "Ja", "confirm", { type: "decision", value: true }, { primary: true }),
      option(prompt, "no", "Nein", "confirm", { type: "decision", value: false }),
    ];
  }
  if (type === "scry") {
    const cards = Array.isArray(input.cards) ? (input.cards as Array<{ id: string }>) : [];
    const zones = Array.isArray(input.zones) ? (input.zones as string[]) : ["libraryTop"];
    const zoneCardIds = zones.map((_, index) => (index === 0 ? cards.map((card) => card.id) : []));
    return [
      option(prompt, "scry-top", "Alles nach oben (Standard)", "confirm", {
        type: "scryDecision",
        zoneCardIds,
      }, { primary: true }),
    ];
  }
  if (type === "reorder") {
    const items = Array.isArray(input.items) ? (input.items as Array<{ id: string }>) : [];
    return [
      option(prompt, "reorder-keep", "Reihenfolge bestaetigen (Standard)", "confirm", {
        type: "reorderDecision",
        orderedIds: items.map((item) => item.id),
      }, { primary: true }),
    ];
  }
  if (type === "diceRolled" || type === "revealCards") {
    return [
      option(prompt, "confirm", "Bestaetigen", "confirm", CONFIRM_OUTPUTS[type] ?? { type: "confirmed" }, {
        primary: true,
      }),
    ];
  }
  return [];
}

export function promptOptions(prompt: AgentPrompt): PromptOption[] {
  const type = prompt.input.type;
  if (type === "chooseAction") return chooseActionOptions(prompt);
  if (type === "payManaCost") return payManaOptions(prompt);
  return defaultAnswerOptions(prompt);
}

/** chooseBoardTargets: candidates the player may send as chosen targets. */
export function targetCandidates(prompt: AgentPrompt): {
  candidates: TargetCandidate[];
  minTargets: number;
  maxTargets: number;
  cancellable: boolean;
} | null {
  if (prompt.input.type !== "chooseBoardTargets") return null;
  const input = prompt.input as {
    type: "chooseBoardTargets";
    candidates: TargetCandidate[];
    minTargets: number;
    maxTargets: number;
    cancellable: boolean;
  };
  return {
    candidates: Array.isArray(input.candidates) ? input.candidates : [],
    minTargets: input.minTargets ?? 1,
    maxTargets: input.maxTargets ?? 1,
    cancellable: Boolean(input.cancellable),
  };
}

/** chooseCards: card list with min/max constraints for the selection UI. */
export function cardChoices(prompt: AgentPrompt): {
  cards: CardChoice[];
  min: number;
  max: number | null;
} | null {
  if (prompt.input.type !== "chooseCards") return null;
  const input = prompt.input as {
    type: "chooseCards";
    cards: CardChoice[];
    min?: number;
    max?: number;
  };
  return {
    cards: Array.isArray(input.cards) ? input.cards : [],
    min: typeof input.min === "number" ? input.min : 0,
    max: typeof input.max === "number" ? input.max : null,
  };
}

/** Unknown prompt families stay visible but cannot be answered blindly. */
export function unsupportedPrompt(prompt: AgentPrompt): boolean {
  const type = prompt.input.type;
  if (type === "chooseBoardTargets" || type === "chooseCards" || type === "gameOver") return false;
  return promptOptions(prompt).length === 0;
}

/** Cards involved in the open prompt (source card + action card ids). */
export function highlightCardIds(prompt: AgentPrompt): Set<string> {
  const ids = new Set<string>();
  if (prompt.sourceCard?.id) ids.add(prompt.sourceCard.id);
  const input = prompt.input as { actions?: AvailableAction[]; cardId?: string };
  if (typeof input.cardId === "string") ids.add(input.cardId);
  for (const action of Array.isArray(input.actions) ? input.actions : []) {
    if (typeof action.cardId === "string") ids.add(action.cardId);
  }
  return ids;
}

