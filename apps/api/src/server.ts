import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createServiceHealth,
  type AppStatus,
  type ServiceHealth,
} from "@mtg-commander/shared";

const API_VERSION = "0.1.0";

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

function appStatus(): AppStatus {
  return {
    ...health(),
    architectureVersion: 1,
    protocolVersion: 5,
    engineConnected: false,
  };
}

export function createApiServer() {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const method = request.method ?? "GET";
    const pathname = new URL(request.url ?? "/", "http://api.local").pathname;

    if (method === "GET" && (pathname === "/healthz" || pathname === "/readyz")) {
      json(response, 200, health());
      return;
    }

    if (method === "GET" && pathname === "/api/status") {
      json(response, 200, appStatus());
      return;
    }

    json(response, 404, { error: "not_found" });
  });
}
