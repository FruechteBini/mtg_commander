import { useEffect, useState } from "react";
import type { AgentPrompt, GameRespondRequest, UiPlayerSeat } from "@mtg-commander/shared";
import {
  cardChoices,
  promptHeadline,
  promptOptions,
  promptSourceText,
  targetCandidates,
  unsupportedPrompt,
} from "./prompt-options.js";

/**
 * UI-003: renders the open prompt for the human seat with one clickable,
 * engine-legal option per action. Selection prompts (targets/cards) keep a
 * local selection until min/max constraints are satisfied.
 */
export function PromptPanel({
  prompt,
  players,
  sending,
  error,
  onRespond,
}: {
  prompt: AgentPrompt;
  players: UiPlayerSeat[];
  sending: boolean;
  error: string | null;
  onRespond: (request: GameRespondRequest) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [prompt.promptId]);

  const options = promptOptions(prompt);
  const targets = targetCandidates(prompt);
  const choices = cardChoices(prompt);

  function send(output: Record<string, unknown>): void {
    onRespond({ promptId: prompt.promptId, actionType: prompt.input.type, output });
  }

  function toggle(id: string): void {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const nameOf = (id: string): string => players.find((player) => player.id === id)?.name ?? id;
  const targetLabel = (id: string, kind: string): string =>
    kind === "player" ? `Spieler: ${nameOf(id)}` : `Karte: ${id}`;

  return (
    <div className="prompt-panel">
      <p className="prompt-headline">
        {promptHeadline(prompt)}
        <span className="muted"> #{prompt.promptId}</span>
      </p>
      {promptSourceText(prompt) ? <p className="prompt-source">{promptSourceText(prompt)}</p> : null}

      {options.length > 0 ? (
        <div className="prompt-options">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`prompt-option kind-${option.kind}${option.primary ? " primary" : ""}`}
              disabled={sending}
              onClick={() => send(option.output)}
            >
              <span>{option.label}</span>
              {option.detail ? <span className="muted">{option.detail}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {targets ? (
        <div className="selection-block">
          <p className="muted">
            {targets.minTargets === targets.maxTargets
              ? `${targets.minTargets} Ziel(e) waehlen`
              : `${targets.minTargets}-${targets.maxTargets} Ziele waehlen`}
          </p>
          <div className="selection-list">
            {targets.candidates.map((candidate) =>
              targets.maxTargets === 1 ? (
                <button
                  key={candidate.id}
                  type="button"
                  className="selection-item"
                  disabled={sending}
                  onClick={() => send({ type: "boardTargets", chosen: [candidate] })}
                >
                  {targetLabel(candidate.id, candidate.kind)}
                </button>
              ) : (
                <button
                  key={candidate.id}
                  type="button"
                  className={`selection-item${selected.has(candidate.id) ? " is-selected" : ""}`}
                  disabled={sending}
                  onClick={() => toggle(candidate.id)}
                >
                  {targetLabel(candidate.id, candidate.kind)}
                </button>
              ),
            )}
          </div>
          {targets.maxTargets !== 1 ? (
            <button
              type="button"
              className="prompt-option primary"
              disabled={sending || selected.size < targets.minTargets || selected.size > targets.maxTargets}
              onClick={() =>
                send({
                  type: "boardTargets",
                  chosen: targets.candidates.filter((candidate) => selected.has(candidate.id)),
                })
              }
            >
              Auswahl bestaetigen ({selected.size})
            </button>
          ) : null}
          {targets.cancellable ? (
            <button
              type="button"
              className="prompt-option kind-cancel"
              disabled={sending}
              onClick={() => send({ type: "cancel" })}
            >
              Abbrechen
            </button>
          ) : null}
        </div>
      ) : null}

      {choices ? (
        <div className="selection-block">
          <p className="muted">
            {choices.min}
            {choices.max !== null ? `-${choices.max}` : " oder mehr"} Karte(n) waehlen
          </p>
          <div className="selection-list">
            {choices.cards.map((card) => (
              <button
                key={card.id}
                type="button"
                className={`selection-item${selected.has(card.id) ? " is-selected" : ""}`}
                disabled={sending}
                onClick={() => toggle(card.id)}
              >
                {card.name ?? card.id}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="prompt-option primary"
            disabled={
              sending ||
              selected.size < choices.min ||
              (choices.max !== null && selected.size > choices.max)
            }
            onClick={() => send({ type: "chooseCardsDecision", chosenCardIds: [...selected] })}
          >
            Auswahl bestaetigen ({selected.size})
          </button>
        </div>
      ) : null}

      {unsupportedPrompt(prompt) ? (
        <details className="prompt-unsupported">
          <summary>Dieser Prompt-Typ wird noch nicht unterstuetzt</summary>
          <pre>{JSON.stringify(prompt.input, null, 2)}</pre>
        </details>
      ) : null}

      {error ? <p className="detail error">{error}</p> : null}
      {sending ? <p className="muted">Antwort wird gesendet …</p> : null}
    </div>
  );
}

