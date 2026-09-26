import type { NormalizedGameView, UiPlayerSeat } from "@mtg-commander/shared";
import { playerDisplayName, roleBadges, viewerPlayerId, zoneCountText, zoneLabel } from "./view-model.js";

export function OpponentPanel({ player, view }: { player: UiPlayerSeat; view: NormalizedGameView }) {
  const zones = view.playerZones.find((group) => group.playerId === player.id)?.zones ?? [];
  const isActive = view.activePlayerId === player.id;
  const displayName = playerDisplayName(player, viewerPlayerId(view));

  return (
    <details className={`opponent${isActive ? " is-active" : ""}`}>
      <summary>
        <span className="opponent-name">{displayName}</span>
        <span className="opponent-life">{player.life} Leben</span>
        <span className="badge-row">
          {roleBadges(player).map((badge) => (
            <span key={badge} className="badge">{badge}</span>
          ))}
        </span>
      </summary>
      <ul className="opponent-zones">
        {zones.map((zone) => (
          <li key={`${zone.kind}-${zone.rawName}`}>
            <span className="zone-name">{zoneLabel(zone.kind)}</span>
            <span className="muted">{zoneCountText(zone)}</span>
            {zone.cards.length > 0 ? (
              <span className="opponent-cards">
                {zone.cards.map((card) => card.name ?? `Karte ${card.id}`).join(", ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}