import { createApiServer } from "./server.js";

const host = process.env.API_HOST ?? "127.0.0.1";
const configuredPort = Number.parseInt(process.env.API_PORT ?? "8787", 10);
const port = Number.isFinite(configuredPort) ? configuredPort : 8787;

const server = createApiServer();

server.listen(port, host, () => {
  console.log(`MTG Commander API listening on http://${host}:${port}`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; closing API server.`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
