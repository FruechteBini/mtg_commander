import { useEffect, useState } from "react";
import type { AppStatus } from "@mtg-commander/shared";
import { GameBoard } from "./game/GameBoard.js";
import { useLiveGame, type LiveGamePanel } from "./game/useLiveGame.js";

type ApiState =
  | { kind: "loading" }
  | { kind: "ready"; status: AppStatus }
  | { kind: "error"; message: string };

export function App() {
  const [apiState, setApiState] = useState<ApiState>({ kind: "loading" });
  const live = useLiveGame();

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
  const livePanel: LiveGamePanel | null =
    live.connection.kind === "live"
      ? {
          snapshot: live.connection.snapshot,
          sending: live.sending,
          respondError: live.respondError,
          onRespond: (request) => {
            void live.respond(request);
          },
        }
      : null;

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">PRIVATE PLAYGROUP PROTOTYPE</p>
        <h1>MTG Commander</h1>
        <p className="intro">
          Ein Mensch, drei Bots und echte Commander-Decks. Mit aktiver Live-Sitz rendert das
          Spielbrett den echten Engine-Zustand und offene Prompts sind direkt im Browser
          beantwortbar (UI-003).
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
        {livePanel ? (
          <p className="detail">
            Live-Sitz: {livePanel.snapshot.humanPlayerName}
            {livePanel.snapshot.roomId ? ` \u00b7 Raum ${livePanel.snapshot.roomId}` : ""}
          </p>
        ) : null}
      </section>

      <GameBoard live={livePanel} />
    </main>
  );
}
