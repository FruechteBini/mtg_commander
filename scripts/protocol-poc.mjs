import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { makePromptResponse, parseRelayMessage } from "../packages/shared/src/manabrew-protocol-parser.mjs";

const root = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const fixturePath = path.join(root, "packages", "shared", "fixtures", "protocol-session.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const messages = fixture.messages.map(parseRelayMessage);
const envelopes = messages.filter((message) => message.type === "StateUpdate").map((message) => message.state);
const stateEnvelope = envelopes.find((envelope) => envelope.kind === "state");
const promptEnvelope = envelopes.find(
  (envelope) => envelope.kind === "prompt" && envelope.prompt.input.type === "chooseAction",
);

if (!stateEnvelope || !promptEnvelope) throw new Error("Fixture lacks a real state/chooseAction sequence.");

const gameView = stateEnvelope.state.gameView;
const actions = promptEnvelope.prompt.input.actions;
const highlights = actions.map((action) => ({
  actionId: action.id,
  actionType: action.type,
  cardId: action.cardId ?? null,
  label: action.label ?? action.description ?? action.type,
}));
const firstActionResponse = makePromptResponse(
  promptEnvelope.forPlayer,
  promptEnvelope.prompt.promptId,
  "chooseAction",
  { type: "act", actionId: actions[0].id },
);
const passResponse = makePromptResponse(
  promptEnvelope.forPlayer,
  promptEnvelope.prompt.promptId,
  "chooseAction",
  { type: "pass", exhaustStack: false },
);

console.log(JSON.stringify({
  summary: {
    players: gameView.players.map((player) => `${player.name} (${player.life})`),
    turn: gameView.turn,
    step: gameView.step,
    priorityPlayerId: gameView.priorityPlayerId,
    promptId: promptEnvelope.prompt.promptId,
    decidingPlayerId: promptEnvelope.prompt.decidingPlayerId,
  },
  highlights,
  sampleResponses: { firstActionResponse, passResponse },
}, null, 2));

