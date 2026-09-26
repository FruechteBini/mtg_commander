import type { NormalizedGameView } from "@mtg-commander/shared";
import { phaseLabel, playerDisplayName, viewerPlayerId } from "./view-model.js";

export function TurnBar({ view }: { view: NormalizedGameView }) {
  const viewerId = viewerPlayerId(view);
  const active = view.players.find((player) => player.id === view.activePlayerId) ?? null;
  const priority = view.players.find((player) => player.id === view.priorityPlayerId) ?? null;

  return (
    <header className="turnbar">
      <div className="turnbar-turn">
        <strong>Zug {view.turn.displayTurn}</strong>
        <span>{phaseLabel(view.turn.phase)}</span>
        <span className="muted">Schritt: {view.turn.step}</span>
      </div>
      <div className="turnbar-actors">
        {active ? (
          <span className="actor is-active">Aktiv: {playerDisplayName(active, viewerId)}</span>
        ) : (
          <span className="muted">Kein aktiver Spieler</span>
        )}
        {priority ? (
          <span className="actor is-priority">Prioritaet: {playerDisplayName(priority, viewerId)}</span>
        ) : null}
        {view.gameOver ? (
          <span className="actor is-over">
            Spiel beendet{view.winnerId ? ` \u00b7 Gewinner: ${view.winnerId}` : ""}
          </span>
        ) : null}
      </div>
    </header>
  );
}