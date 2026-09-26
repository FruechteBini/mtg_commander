import type { UiZone } from "@mtg-commander/shared";
import { zoneCountText, zoneLabel } from "./view-model.js";
import { CardChip } from "./CardChip.js";

export function ZonePanel({
  zone,
  wide = false,
  note = null,
}: {
  zone: UiZone;
  wide?: boolean;
  note?: string | null;
}) {
  const title = zone.kind === "unknown" ? `${zoneLabel(zone.kind)} (${zone.rawName})` : zoneLabel(zone.kind);

  return (
    <article className={`zone${wide ? " zone-wide" : ""}`}>
      <header>
        <h3>{title}</h3>
        <span className="muted">{zoneCountText(zone)}</span>
      </header>
      {zone.cards.length === 0 ? (
        <p className="zone-empty">{zone.hidden ? "Inhalt verdeckt" : "leer"}</p>
      ) : (
        <ul className="card-list">
          {zone.cards.map((card) => (
            <li key={card.id}>
              <CardChip card={card} />
            </li>
          ))}
        </ul>
      )}
      {note ? <p className="zone-note muted">{note}</p> : null}
    </article>
  );
}