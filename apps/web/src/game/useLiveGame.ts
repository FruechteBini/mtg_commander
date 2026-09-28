import { useCallback, useEffect, useRef, useState } from "react";
import type { GameRespondRequest, GameSnapshotDto } from "@mtg-commander/shared";

/**
 * UI-003: polls the API live snapshot and posts prompt answers.
 * Polling keeps the slice dependency-free; SSE can replace it later
 * without touching the components.
 */

export type LiveGameConnection =
  | { kind: "connecting" }
  | { kind: "live"; snapshot: GameSnapshotDto }
  | { kind: "offline"; message: string };

/** Props every board component needs to interact with the live session. */
export interface LiveGamePanel {
  snapshot: GameSnapshotDto;
  sending: boolean;
  respondError: string | null;
  onRespond: (request: GameRespondRequest) => void;
}

export interface LiveGame {
  connection: LiveGameConnection;
  sending: boolean;
  respondError: string | null;
  respond: (request: GameRespondRequest) => Promise<boolean>;
}

export function useLiveGame(pollMs = 1500): LiveGame {
  const [connection, setConnection] = useState<LiveGameConnection>({ kind: "connecting" });
  const [sending, setSending] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const response = await fetch("/api/game", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const snapshot = (await response.json()) as GameSnapshotDto;
      setConnection(snapshot.humanPlayerName ? { kind: "live", snapshot } : { kind: "offline", message: "Keine interaktive Sitz aktiv (MANABREW_ROOM_NAME in der API setzen)." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "API nicht erreichbar";
      setConnection({ kind: "offline", message });
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  const respond = useCallback(
    async (request: GameRespondRequest): Promise<boolean> => {
      setSending(true);
      setRespondError(null);
      try {
        const response = await fetch("/api/game/respond", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
        if (response.status === 204) {
          await refresh();
          return true;
        }
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setRespondError(body?.error ?? `Antwort abgelehnt (HTTP ${response.status}).`);
        await refresh();
        return false;
      } catch (error) {
        setRespondError(error instanceof Error ? error.message : "Antwort konnte nicht gesendet werden.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [refresh],
  );

  return { connection, sending, respondError, respond };
}
