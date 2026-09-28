import type { NormalizedGameView } from "@mtg-commander/shared";
import { manaEntries, playerDisplayName, roleBadges, viewerSeatOf, zoneCountText } from "./view-model.js";
import { HandCard } from "./HandCard.js";
import { ZonePanel } from "./ZonePanel.js";

export function OwnBoard({
  view,
  highlightCardIds = null,
}: {
  view: NormalizedGameView;
  highlightCardIds?: Set<string> | null;
}) {
  const viewer = viewerSeatOf(view);
  if (!viewer) {
    return (
      <section className="own-board" aria-label="Eigener Bereich">
        <p className="muted">Der Zustand enthaelt keine Spieler.</p>
      </section>
    );
  }

  const zones = view.playerZones.find((group) => group.playerId === viewer.id)?.zones ?? [];
  const zoneByKind = (kind: UiZoneKindOf) => zones.find((zone) => zone.kind === kind);
  const hand = zoneByKind("hand");
  const others = zones.filter((zone) => zone.kind === "unknown");
  const mana = manaEntries(viewer.manaPool);
  const commanderNote =
    viewer.commanderCasts.length > 0
      ? viewer.commanderCasts.map((entry) => `${entry.cardId}: ${entry.casts}x gewirkt`).join(" \u00b7 ")
      : null;

  return (
    <section className="own-board" aria-label="Eigener Bereich">
      <header className="own-header">
        <h2>{playerDisplayName(viewer, viewer.id)}</h2>
        <span className="own-life">{viewer.life} Leben</span>
        <span className="badge-row">
          {roleBadges(viewer).map((badge) => (
            <span key={badge} className="badge">{badge}</span>
          ))}
        </span>
        {mana.length > 0 ? (
          <span className="mana-row">
            {mana.map((entry) => (
              <span key={entry.symbol} className={`mana mana-${entry.symbol}`}>
                {entry.symbol}
                {entry.amount}
              </span>
            ))}
          </span>
        ) : null}
      </header>
      <div className="own-zones">
        {zoneByKind("battlefield") ? <ZonePanel wide zone={zoneByKind("battlefield")!} highlightCardIds={highlightCardIds} /> : null}
        {zoneByKind("command") ? <ZonePanel zone={zoneByKind("command")!} note={commanderNote} /> : null}
        {zoneByKind("library") ? <ZonePanel zone={zoneByKind("library")!} /> : null}
        {zoneByKind("graveyard") ? <ZonePanel zone={zoneByKind("graveyard")!} /> : null}
        {zoneByKind("exile") ? <ZonePanel zone={zoneByKind("exile")!} /> : null}
        {others.map((zone) => (
          <ZonePanel key={`${zone.kind}-${zone.rawName}`} zone={zone} />
        ))}
      </div>
      {hand ? (
        <section className="hand-strip" aria-label="Deine Hand">
          <header className="hand-strip-head">
            <h3>Deine Hand</h3>
            <span className="muted">{zoneCountText(hand)}</span>
          </header>
          {hand.cards.length === 0 ? (
            <p className="zone-empty">{hand.hidden ? "Inhalt verdeckt" : "leer"}</p>
          ) : (
            <div className="hand-cards">
              {hand.cards.map((card) => (
                <HandCard key={card.id} card={card} highlight={highlightCardIds?.has(card.id) ?? false} />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

type UiZoneKindOf = "battlefield" | "hand" | "command" | "library" | "graveyard" | "exile";
