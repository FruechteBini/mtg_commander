import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { AppStatus, ServiceHealth } from "@mtg-commander/shared";
import { createApiServer } from "./server.js";

const server = createApiServer();
let baseUrl = "";

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("liveness and readiness endpoints return shared health contracts", async () => {
  for (const endpoint of ["/healthz", "/readyz"]) {
    const response = await fetch(`${baseUrl}${endpoint}`);
    const body = (await response.json()) as ServiceHealth;

    assert.equal(response.status, 200);
    assert.equal(body.service, "api");
    assert.equal(body.status, "ok");
    assert.equal(body.version, "0.1.0");
    assert.ok(Date.parse(body.timestamp));
  }
});

test("browser status contains public state and no server secrets", async () => {
  process.env.MANABREW_SERVER_KEY = "test-relay-secret";
  process.env.ZAI_API_KEY = "test-zai-secret";

  const response = await fetch(`${baseUrl}/api/status`);
  const text = await response.text();
  const body = JSON.parse(text) as AppStatus;

  assert.equal(body.architectureVersion, 1);
  assert.equal(body.protocolVersion, 5);
  assert.equal(body.engineConnected, false);
  assert.doesNotMatch(text, /test-relay-secret|test-zai-secret/);
});

test("unknown routes return a JSON 404", async () => {
  const response = await fetch(`${baseUrl}/does-not-exist`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});
