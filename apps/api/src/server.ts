import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createServiceHealth,
  type AppStatus,
  type EngineConnectionStatus,
  type GameRespondRequest,
  type GameRespondResult,
  type GameSnapshotDto,
  type ServiceHealth,
} from "@mtg-commander/shared";

const API_VERSION = "0.1.0";
const MAX_GAME_BODY_BYTES = 65_536;

function json(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function health(): ServiceHealth {
  return createServiceHealth("api", API_VERSION);
}

function emptyGameSnapshot(engineStatus: EngineConnectionStatus): GameSnapshotDto {
  return {
    engineStatus,
    humanPlayerName: null,
    roomId: null,
    gameId: null,
    viewerPlayerId: null,
    gameEnded: false,
    gameView: null,
    prompt: null,
    lastError: null,
  };
}

async function readJsonBody(request: IncomingMessage): Promise<{ ok: true; body: unknown } | { ok: false; error: string; status: number }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_GAME_BODY_BYTES) return { ok: false, error: "body_too_large", status: 413 };
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) return { ok: false, error: "body_expected", status: 400 };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, error: "invalid_json", status: 400 };
  }
}

function parseRespondRequest(body: unknown): { ok: true; request: GameRespondRequest } | { ok: false; error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body muss ein JSON-Objekt sein." };
  }
  const record = body as Record<string, unknown>;
  const promptId = record.promptId;
  const actionType = record.actionType;
  const output = record.output;
  if (typeof promptId !== "number" || !Number.isInteger(promptId) || promptId < 0) {
    return { ok: false, error: "promptId muss eine nicht-negative Ganzzahl sein." };
  }
  if (typeof actionType !== "string" || actionType.trim().length === 0) {
    return { ok: false, error: "actionType muss ein nicht-leerer String sein." };
  }
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, error: "output muss ein JSON-Objekt sein." };
  }
  return { ok: true, request: { promptId, actionType, output: output as Record<string, unknown> } };
}

export interface ApiServerOptions {
  engineStatus?: () => EngineConnectionStatus;
  gameSnapshot?: () => GameSnapshotDto;
  gameRespond?: (request: GameRespondRequest) => GameRespondResult;
}

function appStatus(engineStatus: EngineConnectionStatus): AppStatus {
  return {
    ...health(),
    architectureVersion: 1,
    protocolVersion: 5,
    engineConnected: engineStatus === "authenticated",
    engineStatus,
  };
}

export function createApiServer(options: ApiServerOptions = {}) {
  const engineStatus = options.engineStatus ?? (() => "disabled");
  const gameSnapshot = options.gameSnapshot ?? (() => emptyGameSnapshot(engineStatus()));
  const gameRespond = options.gameRespond;

  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const method = request.method ?? "GET";
    const pathname = new URL(request.url ?? "/", "http://api.local").pathname;

    if (method === "GET" && (pathname === "/healthz" || pathname === "/readyz")) {
      json(response, 200, health());
      return;
    }

    if (method === "GET" && pathname === "/api/status") {
      json(response, 200, appStatus(engineStatus()));
      return;
    }

    if (method === "GET" && pathname === "/api/game") {
      json(response, 200, gameSnapshot());
      return;
    }

    if (method === "POST" && pathname === "/api/game/respond") {
      void (async () => {
        const parsedBody = await readJsonBody(request);
        if (!parsedBody.ok) {
          json(response, parsedBody.status, { error: parsedBody.error });
          return;
        }
        const parsedRequest = parseRespondRequest(parsedBody.body);
        if (!parsedRequest.ok) {
          json(response, 400, { error: parsedRequest.error });
          return;
        }
        if (!gameRespond) {
          json(response, 503, { error: "engine_unavailable" });
          return;
        }
        const result = gameRespond(parsedRequest.request);
        if (result.ok) {
          response.writeHead(204, { "cache-control": "no-store" });
          response.end();
          return;
        }
        json(response, 409, { error: result.error });
      })();
      return;
    }

    json(response, 404, { error: "not_found" });
  });
}

