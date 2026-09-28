import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Append-only replay journal (SAVE-002, option "B light").
 *
 * The API records the start condition of every game and every outgoing
 * prompt response in order, so a finished or interrupted game can later be
 * replayed once the upstream exposes the game seed (B2, see
 * docs/upstream-seed-issue.md). Until then the journal doubles as an audit
 * and debugging artifact.
 */

export const GAME_JOURNAL_FORMAT_VERSION = 1;

export interface GameJournalSessionMeta {
  relayUrl?: string;
  protocolVersion?: number;
  clientVersion?: string;
}

export interface GameJournalGameStart {
  gameId: string;
  roomId?: string | null;
  playerOrder?: unknown;
}

export interface GameJournalResponse {
  fromPlayer?: unknown;
  promptId?: unknown;
  actionType?: unknown;
  output?: unknown;
  gameId?: string | null;
}

export interface GameJournal {
  readonly filePath: string;
  session(meta: GameJournalSessionMeta): void;
  gameStarted(start: GameJournalGameStart): void;
  response(entry: GameJournalResponse): void;
  gameOver(details?: { gameId?: string | null; turn?: number | null }): void;
  sessionEnd(reason: string): void;
}

export function createGameJournal(
  filePath: string,
  now: () => string = () => new Date().toISOString(),
): GameJournal {
  mkdirSync(dirname(filePath), { recursive: true });

  let sequence = 0;
  let lastGameId: string | null = null;
  let writeFailed = false;

  function append(record: Record<string, unknown>): void {
    if (writeFailed) return;
    try {
      appendFileSync(filePath, `${JSON.stringify({ seq: (sequence += 1), at: now(), ...record })}\n`);
    } catch (error) {
      // Journaling must never take the API down; report once and degrade quietly.
      writeFailed = true;
      console.error(`[game-journal] write failed, journaling disabled: ${(error as Error).message}`);
    }
  }

  return {
    filePath,
    session(meta) {
      append({
        record: "session",
        journalFormat: GAME_JOURNAL_FORMAT_VERSION,
        relayUrl: meta.relayUrl ?? null,
        protocolVersion: meta.protocolVersion ?? null,
        clientVersion: meta.clientVersion ?? null,
      });
    },
    gameStarted(start) {
      lastGameId = start.gameId ?? null;
      append({
        record: "game-started",
        gameId: start.gameId,
        roomId: start.roomId ?? null,
        playerOrder: start.playerOrder ?? null,
      });
    },
    response(entry) {
      append({
        record: "response",
        gameId: entry.gameId ?? lastGameId,
        fromPlayer: entry.fromPlayer ?? null,
        promptId: entry.promptId ?? null,
        actionType: entry.actionType ?? null,
        output: entry.output ?? null,
      });
    },
    gameOver(details = {}) {
      append({
        record: "game-over",
        gameId: details.gameId ?? lastGameId,
        turn: details.turn ?? null,
      });
    },
    sessionEnd(reason) {
      append({ record: "session-end", reason });
    },
  };
}

export function createGameJournalFromEnvironment(now?: () => string): GameJournal | null {
  if (process.env.MANABREW_JOURNAL_DISABLE === "1") return null;
  const directory = process.env.MANABREW_JOURNAL_DIR ?? join(process.cwd(), "captures");
  const stamp = (now ? now() : new Date().toISOString()).replace(/[:.]/g, "-");
  return createGameJournal(join(directory, `game-journal-${stamp}-${process.pid}.jsonl`), now);
}