import { readFileSync } from "node:fs";
import { ManabrewRelayClient, type RelayClientStatus } from "@mtg-commander/manabrew-client";
import type {
  EngineConnectionStatus,
  GameRespondRequest,
  GameRespondResult,
  GameSnapshotDto,
} from "@mtg-commander/shared";
import { createGameJournalFromEnvironment } from "./game-journal.js";
import {
  createInteractiveSession,
  type InteractiveSession,
  type InteractiveSessionConfig,
  type SessionDeckConfig,
} from "./engine-session.js";

export interface EngineRuntime {
  start(): void;
  close(): void;
  status(): EngineConnectionStatus;
  /** UI-003: live state + open prompt for the browser. */
  gameSnapshot(): GameSnapshotDto;
  /** UI-003: forward a prompt answer from the browser to the relay. */
  respond(request: GameRespondRequest): GameRespondResult;
  /** UI-004 stage 1: toggle auto-pass for action-free chooseAction prompts. */
  setAutoPass(enabled: boolean): GameRespondResult;
}

function emptySnapshot(engineStatus: EngineConnectionStatus): GameSnapshotDto {
  return {
    engineStatus,
    humanPlayerName: null,
    roomId: null,
    gameId: null,
    viewerPlayerId: null,
    gameEnded: false,
    gameView: null,
    prompt: null,
    autoPass: false,
    lastError: null,
  };
}

const disabledRuntime: EngineRuntime = {
  start() {},
  close() {},
  status: () => "disabled",
  gameSnapshot: () => emptySnapshot("disabled"),
  respond: () => ({ ok: false, error: "Engine-Integration ist deaktiviert (MANABREW_RELAY_URL/MANABREW_SERVER_KEY fehlen)." }),
  setAutoPass: () => ({ ok: false, error: "Engine-Integration ist deaktiviert (MANABREW_RELAY_URL/MANABREW_SERVER_KEY fehlen)." }),
};

function asEngineStatus(status: RelayClientStatus): EngineConnectionStatus {
  return status;
}

function deckConfigFromEnvironment(): SessionDeckConfig | null {
  if (process.env.MANABREW_DECK_DISABLE === "1") return null;
  const file = process.env.MANABREW_DECK_FILE ?? "decks/dina-sacrifice.txt";
  let deckText: string;
  try {
    deckText = readFileSync(file, "utf8");
  } catch {
    console.error(`[manabrew] Deck-Datei nicht lesbar: ${file} (Sitz beobachtet nur)`);
    return null;
  }
  return {
    deckText,
    owner: process.env.MANABREW_DECK_OWNER ?? "Korbi",
    name: process.env.MANABREW_DECK_NAME ?? "Dina Sacrifice",
    commanderName: process.env.MANABREW_DECK_COMMANDER ?? "Dina, Essence Brewer",
  };
}

function sessionConfigFromEnvironment(username: string): InteractiveSessionConfig | null {
  const roomName = process.env.MANABREW_ROOM_NAME;
  if (!roomName) return null;
  const botCount = Number.parseInt(process.env.MANABREW_BOT_COUNT ?? "3", 10);
  return {
    username,
    roomName,
    roomPassword: process.env.MANABREW_ROOM_PASSWORD ?? "local-dev",
    deck: deckConfigFromEnvironment(),
    spawnBots: process.env.MANABREW_SPAWN_BOTS !== "0",
    botCount: Number.isFinite(botCount) && botCount >= 1 && botCount <= 3 ? botCount : 3,
    autoPass: process.env.MANABREW_AUTO_PASS !== "0",
  };
}

export function createEngineRuntimeFromEnvironment(): EngineRuntime {
  const url = process.env.MANABREW_RELAY_URL;
  const password = process.env.MANABREW_SERVER_KEY;

  if (!url || !password) return disabledRuntime;

  const username = process.env.MANABREW_API_USERNAME ?? `mtg-api-${process.pid}`;

  const client = new ManabrewRelayClient({
    url,
    password,
    username,
    clientPlatform: "unknown",
    clientVersion: "0.1.0",
    reconnect: true,
  });

  client.on("error", (error: Error) => {
    console.error(`[manabrew] ${error.message}`);
  });
  client.on("relayError", (message: { code?: string; message: string }) => {
    console.error(`[manabrew] relay error ${message.code ?? "unknown"}: ${message.message}`);
  });

  // UI-003: optional interactive seat (join lobby, deck, ready, bots, start).
  const sessionConfig = sessionConfigFromEnvironment(username);
  let session: InteractiveSession | null = null;
  if (sessionConfig) {
    session = createInteractiveSession(client, sessionConfig, (message) => console.log(message));
  }

  // SAVE-002 "B light": record start condition and every prompt response
  // in order so the game can be replayed once the upstream exposes the seed.
  const journal = createGameJournalFromEnvironment();
  if (journal) {
    journal.session({ relayUrl: url, protocolVersion: 5, clientVersion: "0.1.0" });
    client.on("send", (message: any) => {
      if (message?.type !== "BroadcastState" || message.state?.kind !== "response") return;
      journal.response({
        fromPlayer: message.state.fromPlayer,
        promptId: message.state.promptId,
        actionType: message.state.action?.type,
        output: message.state.action?.output,
      });
    });
    client.on("message", (message: any) => {
      if (message?.type === "GameStarted") {
        journal.gameStarted({
          gameId: String(message.game_id ?? ""),
          roomId: message.room_id ?? null,
          playerOrder: message.player_order ?? null,
        });
        return;
      }
      if (
        message?.type === "StateUpdate" &&
        message.state?.kind === "prompt" &&
        message.state.prompt?.input?.type === "gameOver"
      ) {
        journal.gameOver({});
      }
    });
  }

  return {
    start: () => client.connect(),
    close: () => {
      client.close();
      journal?.sessionEnd("close");
    },
    status: () => asEngineStatus(client.status),
    gameSnapshot: () =>
      session ? session.snapshot(asEngineStatus(client.status)) : emptySnapshot(asEngineStatus(client.status)),
    respond: (request) =>
      session
        ? session.respond(request)
        : { ok: false, error: "Keine interaktive Sitz aktiv (MANABREW_ROOM_NAME nicht gesetzt)." },
    setAutoPass: (enabled) =>
      session
        ? session.setAutoPass(enabled)
        : { ok: false, error: "Keine interaktive Sitz aktiv (MANABREW_ROOM_NAME nicht gesetzt)." },
  };
}

