import type { UiCard } from "@mtg-commander/shared";
import { cardBadges, cardTitle, creatureStats } from "./view-model.js";

export function CardChip({ card }: { card: UiCard }) {
  const stats = creatureStats(card);
  const badges = cardBadges(card);

  return (
    <div
      className={[
        "card-chip",
        card.tapped ? "is-tapped" : "",
        card.visibility !== "visible" ? "is-unknown" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="card-name">{cardTitle(card)}</span>
      {stats ? <span className="card-stats">{stats}</span> : null}
      {badges.length > 0 ? (
        <span className="badge-row">
          {badges.map((badge) => (
            <span key={badge} className="badge">{badge}</span>
          ))}
        </span>
      ) : null}
    </div>
  );
}