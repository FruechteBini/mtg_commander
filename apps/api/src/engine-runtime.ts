import { ManabrewRelayClient, type RelayClientStatus } from "@mtg-commander/manabrew-client";
import type { EngineConnectionStatus } from "@mtg-commander/shared";

export interface EngineRuntime {
  start(): void;
  close(): void;
  status(): EngineConnectionStatus;
}

const disabledRuntime: EngineRuntime = {
  start() {},
  close() {},
  status: () => "disabled",
};

function asEngineStatus(status: RelayClientStatus): EngineConnectionStatus {
  return status;
}

export function createEngineRuntimeFromEnvironment(): EngineRuntime {
  const url = process.env.MANABREW_RELAY_URL;
  const password = process.env.MANABREW_SERVER_KEY;

  if (!url || !password) return disabledRuntime;

  const client = new ManabrewRelayClient({
    url,
    password,
    username: process.env.MANABREW_API_USERNAME ?? `mtg-api-${process.pid}`,
    clientPlatform: "mtg-commander-api",
    clientVersion: "0.1.0",
    reconnect: true,
  });

  client.on("error", (error: Error) => {
    console.error(`[manabrew] ${error.message}`);
  });
  client.on("relayError", (message: { code?: string; message: string }) => {
    console.error(`[manabrew] relay error ${message.code ?? "unknown"}: ${message.message}`);
  });

  return {
    start: () => client.connect(),
    close: () => client.close(),
    status: () => asEngineStatus(client.status),
  };
}
