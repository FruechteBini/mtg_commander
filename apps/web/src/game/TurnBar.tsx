import type { NormalizedGameView } from "@mtg-commander/shared";
import { phaseLabel, playerDisplayName, stepLabel, viewerPlayerId } from "./view-model.js";

export function TurnBar({ view }: { view: NormalizedGameView }) {
  const viewerId = viewerPlayerId(view);
  const active = view.players.find((player) => player.id === view.activePlayerId) ?? null;
  const priority = view.players.find((player) => player.id === view.priorityPlayerId) ?? null;
  const ownTurn = active !== null && viewerId !== null && active.id === viewerId;
  const nameOf = (id: string) => {
    const player = view.players.find((entry) => entry.id === id);
    return player ? playerDisplayName(player, viewerId) : id;
  };

  return (
    <header className={`turnbar${ownTurn ? " is-own-turn" : ""}`} aria-label="Zug- und Phasenanzeige">
      <div className="turnbar-counter">
        <span className="turn-number">
          <span className="turn-number-label">Zug</span>
          <strong>{view.turn.displayTurn}</strong>
        </span>
        <span className="turn-sub">
          {phaseLabel(view.turn.phase)}{" \u00b7 "}{stepLabel(view.turn.step)}
        </span>
      </div>
      <div className="turnbar-actors">
        {active ? (
          ownTurn ? (
            <span className="actor is-own">Dein Zug</span>
          ) : (
            <span className="actor is-active">Zug von {playerDisplayName(active, viewerId)}</span>
          )
        ) : (
          <span className="muted">Kein aktiver Spieler</span>
        )}
        {priority ? (
          <span className="actor is-priority">
            {priority.id === viewerId ? "Du hast Prioritaet" : `Prioritaet: ${playerDisplayName(priority, viewerId)}`}
          </span>
        ) : null}
        {view.gameOver ? (
          <span className="actor is-over">
            Spiel beendet{view.winnerId ? ` \u00b7 Gewinner: ${nameOf(view.winnerId)}` : ""}
          </span>
        ) : null}
      </div>
    </header>
  );
}