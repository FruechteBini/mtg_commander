import type { NormalizedGameView } from "@mtg-commander/shared";
import { playerDisplayName, viewerPlayerId } from "./view-model.js";

export function SidePanel({ view }: { view: NormalizedGameView }) {
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
        <p className="muted">
          Kein offener Prompt. Prompt-Aktionen werden angebunden, sobald die API den Live-Betrieb liefert.
        </p>
      </section>
    </aside>
  );
}