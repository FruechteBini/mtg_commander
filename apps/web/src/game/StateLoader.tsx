import { useState } from "react";
import type { NormalizedGameView } from "@mtg-commander/shared";
import { gameViewFromJson } from "./view-model.js";

export function StateLoader({
  source,
  onLoaded,
}: {
  source: string;
  onLoaded: (view: NormalizedGameView, label: string) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    try {
      const view = gameViewFromJson(text);
      onLoaded(view, `Eingefuegter State \u00b7 gameId ${view.gameId}`);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unbekannter Fehler");
    }
  }

  return (
    <details className="state-loader">
      <summary>Echten Capture-State laden</summary>
      <p className="muted">
        Eine StateUpdate-Nachricht, einen State-Envelope oder ein gameView-Objekt aus
        captures/*.jsonl einfuegen und statisch rendern.
      </p>
      <textarea
        rows={6}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder='{"type":"StateUpdate","state":{"kind":"state",...}}'
        spellCheck={false}
      />
      <div className="state-loader-actions">
        <button type="button" onClick={load}>Rendern</button>
        <span className="muted">Aktuelle Quelle: {source}</span>
      </div>
      {error ? <p className="detail error">{error}</p> : null}
    </details>
  );
}