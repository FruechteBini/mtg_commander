import type { EngineConnectionStatus } from "./health.js";
import type { AgentPrompt, GameViewDto } from "./manabrew-protocol.js";

/**
 * UI-003 live game contract between the API (relay session owner) and the
 * browser. The API caches the latest gameView plus open prompt for the human
 * seat and the browser polls `GET /api/game`; answers are posted to
 * `POST /api/game/respond`.
 */
export interface GameSnapshotDto {
  engineStatus: EngineConnectionStatus;
  humanPlayerName: string | null;
  roomId: string | null;
  gameId: string | null;
  viewerPlayerId: string | null;
  gameEnded: boolean;
  gameView: GameViewDto | null;
  prompt: AgentPrompt | null;
  /**
   * UI-004 stage 1: when true the session answers chooseAction prompts that
   * carry no legal actions (pure priority checks, e.g. after bot moves)
   * automatically with `pass` so they never block the browser.
   */
  autoPass: boolean;
  /** Last engine/relay error message so the UI can surface failures. */
  lastError: string | null;
}

export interface GameRespondRequest {
  promptId: number;
  actionType: string;
  output: Record<string, unknown>;
}

export type GameRespondResult = { ok: true } | { ok: false; error: string };
