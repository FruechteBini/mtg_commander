import type { UiCard } from "@mtg-commander/shared";
import { cardColorClass, cardTitle, creatureStats, typeLine } from "./view-model.js";

/**
 * UI-003: grosse, lesbare Hand-Kachel. Sobald ein Scryfall-Bild geladen ist,
 * wird die echte Karte gezeigt; sonst (Offline / nicht gefunden / laedt noch)
 * dient die Text-Kachel als Fallback.
 */
export function HandCard({ card, imageUrl = null, highlight = false }: { card: UiCard; imageUrl?: string | null; highlight?: boolean }) {
  const stats = creatureStats(card);
  const cost = card.manaCost !== null && card.manaCost !== "no cost" ? card.manaCost : null;
  const tooltip = [cardTitle(card), typeLine(card), cost, card.rulesText ?? null].filter(Boolean).join("\n");
  const classes = ["hand-card", cardColorClass(card), highlight ? "is-highlight" : ""].filter(Boolean).join(" ");

  if (imageUrl !== null) {
    return (
      <div className={`${classes} is-image`} title={tooltip}>
        <img src={imageUrl} alt={cardTitle(card)} loading="lazy" />
      </div>
    );
  }

  return (
    <div className={classes} title={tooltip}>
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

