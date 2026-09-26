import { createEngineRuntimeFromEnvironment } from "./engine-runtime.js";
import { createApiServer } from "./server.js";

try {
  process.loadEnvFile();
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code !== "ENOENT") throw error;
}

const host = process.env.API_HOST ?? "127.0.0.1";
const configuredPort = Number.parseInt(process.env.API_PORT ?? "8787", 10);
const port = Number.isFinite(configuredPort) ? configuredPort : 8787;

const engineRuntime = createEngineRuntimeFromEnvironment();
const server = createApiServer({ engineStatus: () => engineRuntime.status() });

server.listen(port, host, () => {
  console.log(`MTG Commander API listening on http://${host}:${port}`);
  engineRuntime.start();
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; closing API server.`);
  engineRuntime.close();
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
