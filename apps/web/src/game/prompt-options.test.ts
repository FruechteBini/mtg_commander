import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentPrompt } from "@mtg-commander/shared";
import {
  cardChoices,
  highlightCardIds,
  promptHeadline,
  promptOptions,
  promptSourceText,
  targetCandidates,
  unsupportedPrompt,
} from "./prompt-options.js";

function prompt(input: AgentPrompt["input"], extra: Partial<AgentPrompt> = {}): AgentPrompt {
  return { promptId: 7, decidingPlayerId: "player-0", input, ...extra };
}

test("chooseAction renders every legal action plus pass and marks play land primary", () => {
  const options = promptOptions(
    prompt({
      type: "chooseAction",
      actions: [
        { id: "a1", type: "playLand", label: "Play Forest" },
        { id: "a2", type: "castSpell", label: "Cast Dina", cardId: "engine-card-9" },
      ],
    }),
  );

  assert.equal(options.length, 3);
  assert.deepEqual(options[0]?.output, { type: "act", actionId: "a1" });
  assert.equal(options[0]?.primary, true);
  assert.equal(options[0]?.actionType, "chooseAction");
  const pass = options[2];
  assert.equal(pass?.kind, "pass");
  assert.deepEqual(pass?.output, { type: "pass", exhaustStack: false });
  assert.equal(pass?.primary, false);
});

test("payManaCost prefers the mana pool, lists mana actions and can cancel", () => {
  const options = promptOptions(
    prompt({
      type: "payManaCost",
      actions: [{ id: "tap:engine-card-44:0", type: "tapLand", label: "Tap Swamp" }],
      canConfirmFromPool: true,
      cardId: "engine-card-9",
      cardName: "Dina",
      manaCost: "{1}{B}",
    }),
  );

  assert.equal(options.length, 3);
  assert.deepEqual(options[0]?.output, { type: "pay", auto: false });
  assert.equal(options[0]?.primary, true);
  assert.deepEqual(options[1]?.output, { type: "act", actionId: "tap:engine-card-44:0" });
  assert.deepEqual(options[2]?.output, { type: "cancel" });
});

test("simple prompt families map to engine-legal default answers", () => {
  const mulligan = promptOptions(prompt({ type: "mulligan" }));
  assert.deepEqual(mulligan[0]?.output, { type: "mulliganDecision", keep: true });

  const dice = promptOptions(prompt({ type: "diceRolled" }));
  assert.deepEqual(dice[0]?.output, { type: "diceRolledAcknowledged" });

  const boolean = promptOptions(prompt({ type: "chooseBoolean" }));
  assert.deepEqual(boolean[1]?.output, { type: "decision", value: false });

  const putBack = promptOptions(
    prompt({ type: "mulliganPutBack", handCardIds: [{ id: "c1" }, { id: "c2" }], count: 1 }),
  );
  assert.deepEqual(putBack[0]?.output, { type: "mulliganPutBackDecision", cardIds: ["c1"] });
});

test("selection prompts expose candidates and card choices with constraints", () => {
  const targets = targetCandidates(
    prompt({
      type: "chooseBoardTargets",
      candidates: [
        { id: "player-1", kind: "player" },
        { id: "engine-card-3", kind: "card" },
      ],
      minTargets: 1,
      maxTargets: 1,
      chosenTargets: 0,
      cancellable: true,
    }),
  );
  assert.equal(targets?.candidates.length, 2);
  assert.equal(targets?.minTargets, 1);
  assert.equal(targets?.cancellable, true);

  const choices = cardChoices(
    prompt({ type: "chooseCards", cards: [{ id: "c1", name: "Forest" }], min: 1, max: 1 }),
  );
  assert.equal(choices?.cards.length, 1);
  assert.equal(choices?.min, 1);
  assert.equal(choices?.max, 1);
});

test("unknown prompt families are reported as unsupported instead of guessing", () => {
  const unknown = prompt({ type: "mysteryPrompt" });
  assert.equal(promptOptions(unknown).length, 0);
  assert.equal(unsupportedPrompt(unknown), true);
  assert.equal(unsupportedPrompt(prompt({ type: "chooseAction", actions: [] })), false);
  assert.equal(promptHeadline(unknown), "Prompt: mysteryPrompt");
});

test("highlighting collects the source card and action card ids", () => {
  const ids = highlightCardIds(
    prompt(
      {
        type: "chooseAction",
        actions: [
          { id: "a1", type: "castSpell", cardId: "engine-card-2" },
          { id: "a2", type: "playLand", cardId: "engine-card-3" },
        ],
      },
      { sourceCard: { id: "engine-card-9", zone: "hand", owner: "player-0" } },
    ),
  );
  assert.deepEqual([...ids].sort(), ["engine-card-2", "engine-card-3", "engine-card-9"]);
  assert.equal(promptSourceText(prompt({ type: "mulligan" }, { sourceAbilityText: "Mulligan?" })), "Mulligan?");
});
