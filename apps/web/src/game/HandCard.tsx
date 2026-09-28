import type { UiCard } from "@mtg-commander/shared";
import { cardColorClass, cardTitle, creatureStats, typeLine } from "./view-model.js";

/**
 * UI-003: large, readable hand tile (name, cost, type line, stats, rules text)
 * so the human can actually identify and play their cards in the browser.
 */
export function HandCard({ card, highlight = false }: { card: UiCard; highlight?: boolean }) {
  const stats = creatureStats(card);
  const cost = card.manaCost !== null && card.manaCost !== "no cost" ? card.manaCost : null;
  const tooltip = [cardTitle(card), typeLine(card), cost, card.rulesText ?? null].filter(Boolean).join("\n");

  return (
    <div
      className={["hand-card", cardColorClass(card), highlight ? "is-highlight" : ""].filter(Boolean).join(" ")}
      title={tooltip}
    >
      <header className="hand-card-top">
        {cost ? <span className="hand-card-cost">{cost}</span> : null}
      </header>
      <span className="hand-card-name">{cardTitle(card)}</span>
      <span className="hand-card-type">{typeLine(card)}</span>
      {stats ? <span className="hand-card-stats">{stats}</span> : null}
      {card.rulesText ? <p className="hand-card-text">{card.rulesText}</p> : null}
    </div>
  );
}
