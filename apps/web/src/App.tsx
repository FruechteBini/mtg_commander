import { useEffect, useState } from "react";
import type { AppStatus } from "@mtg-commander/shared";

type ApiState =
  | { kind: "loading" }
  | { kind: "ready"; status: AppStatus }
  | { kind: "error"; message: string };

export function App() {
  const [apiState, setApiState] = useState<ApiState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`API antwortet mit HTTP ${response.status}`);
        return (await response.json()) as AppStatus;
      })
      .then((status) => setApiState({ kind: "ready", status }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "API nicht erreichbar";
        setApiState({ kind: "error", message });
      });

    return () => controller.abort();
  }, []);

  const apiReady = apiState.kind === "ready" && apiState.status.status === "ok";

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">PRIVATE PLAYGROUP PROTOTYPE</p>
        <h1>MTG Commander</h1>
        <p className="intro">
          Ein Mensch, drei Bots und echte Commander-Decks. Dieses Grundgeruest verbindet die
          eigene React-Oberflaeche ausschliesslich mit der serverseitigen API.
        </p>
      </header>

      <section className="status-card" aria-live="polite">
        <div>
          <p className="label">SYSTEMSTATUS</p>
          <h2>{apiReady ? "API bereit" : apiState.kind === "loading" ? "API wird geprueft" : "API nicht erreichbar"}</h2>
        </div>
        <span className={`status-dot ${apiReady ? "online" : "offline"}`} aria-hidden="true" />
        {apiState.kind === "ready" && (
          <p className="detail">
            Protocol v{apiState.status.protocolVersion} · Engine: {apiState.status.engineStatus}
          </p>
        )}
        {apiState.kind === "error" && <p className="detail error">{apiState.message}</p>}
      </section>

      <section className="grid" aria-label="Architekturstatus">
        <article>
          <p className="step">01</p>
          <h2>Browser</h2>
          <p>Zeigt den spaeteren Spielzustand und sendet nur Benutzerentscheidungen an die API.</p>
        </article>
        <article>
          <p className="step">02</p>
          <h2>Eigene API</h2>
          <p>Haelt Secrets, orchestriert Spiele und wird die Relay-Verbindung verwalten.</p>
        </article>
        <article>
          <p className="step">03</p>
          <h2>Forge Engine</h2>
          <p>Bleibt die Autoritaet fuer Regeln, legale Aktionen und den Commander-Spielzustand.</p>
        </article>
      </section>
    </main>
  );
}
