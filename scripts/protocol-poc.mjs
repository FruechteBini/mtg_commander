import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const fixturePath = path.join(root, "packages", "shared", "fixtures", "protocol-session.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const stateMessage = fixture.messages.find((message) => message.kind === "state");
const promptMessage = fixture.messages.find((message) => message.kind === "prompt");

if (!stateMessage?.gameView) {
  throw new Error("Fixture does not contain a state message with gameView.");
}

if (promptMessage?.prompt?.input?.type !== "chooseAction") {
  throw new Error("Fixture does not contain a chooseAction prompt.");
}

const gameView = stateMessage.gameView;
const prompt = promptMessage.prompt;
const actions = prompt.input.actions;

const highlights = actions.map((action) => ({
  actionId: action.id,
  actionType: action.type,
  cardId: action.cardId ?? null,
  label: action.modeLabel ?? action.description ?? action.type,
}));

const firstActionResponse = {
  kind: "response",
  promptId: prompt.promptId,
  action: {
    type: "chooseAction",
    output: {
      type: "act",
      actionId: actions[0].id,
    },
  },
};

const passResponse = {
  kind: "response",
  promptId: prompt.promptId,
  action: {
    type: "chooseAction",
    output: {
      type: "pass",
      exhaustStack: false,
    },
  },
};

console.log(JSON.stringify({
  summary: {
    players: gameView.players.map((player) => `${player.name} (${player.life})`),
    step: gameView.step,
    priorityPlayerId: gameView.priorityPlayerId,
    promptId: prompt.promptId,
    decidingPlayerId: prompt.decidingPlayerId,
  },
  highlights,
  sampleResponses: {
    firstActionResponse,
    passResponse,
  },
}, null, 2));
