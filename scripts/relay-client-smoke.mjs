import { ManabrewRelayClient } from "@mtg-commander/manabrew-client";

try {
  process.loadEnvFile("infra/manabrew-forge-room/.env");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const url = process.env.MANABREW_RELAY_URL ?? "ws://127.0.0.1:9443";
const password = process.env.MANABREW_SERVER_KEY;
const roomName = process.env.SELF_HOSTED_NODE_ROOM_NAME ?? "MTG-Commander PoC";

if (!password) {
  throw new Error("MANABREW_SERVER_KEY is required (environment or infra/manabrew-forge-room/.env)");
}

const client = new ManabrewRelayClient({
  url,
  username: `mtg-smoke-${process.pid}`,
  password,
  clientPlatform: "mtg-commander-smoke",
  clientVersion: "0.1.0",
  reconnect: false,
});

const timeout = setTimeout(() => {
  client.close();
  console.error("Relay smoke test timed out");
  process.exitCode = 1;
}, 10_000);

client.on("error", (error) => {
  clearTimeout(timeout);
  console.error(`Relay smoke test failed: ${error.message}`);
  process.exitCode = 1;
  client.close();
});

client.on("invalidMessage", ({ error }) => {
  clearTimeout(timeout);
  console.error(`Relay returned an invalid message: ${error.message}`);
  process.exitCode = 1;
  client.close();
});

client.on("message", (message) => {
  if (message.type === "AuthResult") {
    if (!message.success) {
      clearTimeout(timeout);
      console.error(`Relay authentication failed: ${message.error ?? "unknown error"}`);
      process.exitCode = 1;
      client.close();
      return;
    }
    client.listRooms();
    return;
  }

  if (message.type !== "RoomList") return;
  const room = message.rooms.find((candidate) => candidate.room_name === roomName);
  clearTimeout(timeout);
  if (!room) {
    console.error(`Relay is reachable, but room '${roomName}' was not found`);
    process.exitCode = 1;
  } else {
    console.log(`Relay smoke test passed: authenticated and found room '${room.room_name}'`);
  }
  client.close();
});

client.connect();
