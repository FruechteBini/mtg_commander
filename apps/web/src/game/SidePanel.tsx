import type { NormalizedGameView } from "@mtg-commander/shared";
import { playerDisplayName, viewerPlayerId } from "./view-model.js";
import type { LiveGamePanel } from "./useLiveGame.js";
import { PromptPanel } from "./PromptPanel.js";

export function SidePanel({
  view,
  live = null,
}: {
  view: NormalizedGameView;
  live?: LiveGamePanel | null;
}) {
  const viewerId = viewerPlayerId(view);
  const nameOf = (id: string) => {
    const player = view.players.find((entry) => entry.id === id);
    return player ? playerDisplayName(player, viewerId) : id;
  };

  return (
    <aside className="side-panel">
      <section className="panel">
        <h3>Stack</h3>
        {view.stack.length === 0 ? (
          <p className="muted">Stack leer</p>
        ) : (
          <ul className="stack-list">
            {view.stack.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.name ?? "Unbekannter Zauber"}</strong>
                <span className="muted">
                  {entry.controllerId ? nameOf(entry.controllerId) : "ohne Kontrolleur"}
                </span>
                {entry.targets.length > 0 ? (
                  <span className="stack-targets">
                    Ziele:{" "}
                    {entry.targets
                      .map((target) => (target.kind === "player" ? nameOf(target.id) : `Karte ${target.id}`))
                      .join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <h3>Prompt</h3>
        {!live ? (
          <p className="muted">
            Kein Live-Spiel verbunden. Die API braucht MANABREW_ROOM_NAME fuer eine interaktive Sitz.
          </p>
        ) : live.snapshot.gameEnded ? (
          <p className="muted">Spiel beendet. Forge-Room neu starten, um eine neue Runde zu starten.</p>
        ) : live.snapshot.prompt ? (
          <PromptPanel
            prompt={live.snapshot.prompt}
            players={view.players}
            sending={live.sending}
            error={live.respondError}
            onRespond={live.onRespond}
          />
        ) : (
          <p className="muted">
            Kein offener Prompt. Die Engine wartet auf andere Sitze oder den naechsten Schritt.
          </p>
        )}
        {live?.snapshot.lastError ? (
          <p className="detail error">Engine-Meldung: {live.snapshot.lastError}</p>
        ) : null}
      </section>
    </aside>
  );
}
