import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import url from "node:url";
import { makePromptResponse, parseRelayMessage } from "../packages/shared/src/manabrew-protocol-parser.mjs";

const root = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(path.join(root, "packages/shared/fixtures/protocol-session.json"), "utf8"));
const messages = fixture.messages.map(parseRelayMessage);
const updates = messages.filter((message) => message.type === "StateUpdate");
const states = updates.filter((message) => message.state.kind === "state");
const prompts = updates.filter((message) => message.state.kind === "prompt");

assert.equal(fixture.protocolVersion, 5);
assert.equal(messages[0].type, "GameStarted");
assert.equal(messages[0].player_order.length, 4);
assert.equal(states.length, 2);
assert.deepEqual(prompts.map((message) => message.state.prompt.input.type), [
  "chooseAction", "chooseBoardTargets", "payManaCost", "payManaCost",
]);

const chooseAction = prompts[0].state;
const castResponse = makePromptResponse(chooseAction.forPlayer, chooseAction.prompt.promptId, "chooseAction", {
  type: "act",
  actionId: chooseAction.prompt.input.actions[0].id,
});
assert.deepEqual(castResponse.state.action.output, { type: "act", actionId: "prompt-action-1" });

const targetPrompt = prompts[1].state;
const target = targetPrompt.prompt.input.candidates.find((candidate) => candidate.id !== targetPrompt.forPlayer);
const targetResponse = makePromptResponse(targetPrompt.forPlayer, targetPrompt.prompt.promptId, "chooseBoardTargets", {
  type: "boardTargets",
  chosen: [target],
});
assert.equal(targetResponse.state.action.output.chosen[0].id, "player-1");

const manaActionPrompt = prompts[2].state;
const manaResponse = makePromptResponse(manaActionPrompt.forPlayer, manaActionPrompt.prompt.promptId, "payManaCost", {
  type: "act",
  actionId: manaActionPrompt.prompt.input.actions[0].id,
});
assert.equal(manaResponse.state.action.output.type, "act");

const manaConfirmPrompt = prompts[3].state;
const payResponse = makePromptResponse(manaConfirmPrompt.forPlayer, manaConfirmPrompt.prompt.promptId, "payManaCost", {
  type: "pay",
  auto: false,
});
assert.deepEqual(payResponse.state.action.output, { type: "pay", auto: false });

const before = states[0].state.state.gameView;
const after = states[1].state.state.gameView;
assert.equal(before.turn, 3);
assert.equal(before.players[1].life - after.players[1].life, 2);
assert.equal(before.zones.find((zone) => zone.zone === "hand").cards[0].identity.name, "Shock");
assert.equal(after.zones.find((zone) => zone.zone === "graveyard").cards[0].identity.name, "Shock");
assert.equal(after.stack.length, 0);

assert.throws(() => parseRelayMessage({ type: "StateUpdate", state: { kind: "prompt" } }), /state\.forPlayer/);
assert.throws(() => parseRelayMessage({
  type: "StateUpdate",
  state: { kind: "state", fingerprint: "bad", state: { gameView: { turnNumber: 3 } } },
}), /gameId/);

const rawCapturePath = path.join(root, "captures/manabrew-real-session-2026-09-17T12-59-23-759Z.jsonl");
let realMessages = 0;
if (fs.existsSync(rawCapturePath)) {
  const lines = readline.createInterface({ input: fs.createReadStream(rawCapturePath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    parseRelayMessage(record.message);
    realMessages += 1;
  }
}

console.log(
  `Protocol contract PASS: ${messages.length} fixture messages, ${prompts.length} prompts, ` +
  `Shock 40 -> 38, ${realMessages || "no local"} real capture messages validated.`,
);
