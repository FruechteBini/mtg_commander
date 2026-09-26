function fail(path, expectation) {
  throw new TypeError(`Invalid Manabrew message at ${path}: expected ${expectation}`);
}

function object(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "object");
  return value;
}
function string(value, path) { if (typeof value !== "string") fail(path, "string"); return value }
function number(value, path) { if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "finite number"); return value }
function boolean(value, path) { if (typeof value !== "boolean") fail(path, "boolean"); return value }
function array(value, path) { if (!Array.isArray(value)) fail(path, "array"); return value }
function optional(value, validate, path) { if (value !== undefined && value !== null) validate(value, path) }

function validateTarget(value, path) {
  const target = object(value, path);
  string(target.id, `${path}.id`);
  string(target.kind, `${path}.kind`);
}

function validateAction(value, path) {
  const action = object(value, path);
  string(action.id, `${path}.id`);
  string(action.type, `${path}.type`);
  optional(action.cardId, string, `${path}.cardId`);
}

function validatePromptInput(value, path) {
  const input = object(value, path);
  const type = string(input.type, `${path}.type`);
  if (type === "chooseAction") {
    array(input.actions, `${path}.actions`).forEach((item, index) => validateAction(item, `${path}.actions[${index}]`));
  } else if (type === "chooseBoardTargets") {
    array(input.candidates, `${path}.candidates`).forEach((item, index) => validateTarget(item, `${path}.candidates[${index}]`));
    number(input.minTargets, `${path}.minTargets`);
    number(input.maxTargets, `${path}.maxTargets`);
    boolean(input.cancellable, `${path}.cancellable`);
  } else if (type === "payManaCost") {
    array(input.actions, `${path}.actions`).forEach((item, index) => validateAction(item, `${path}.actions[${index}]`));
    boolean(input.canConfirmFromPool, `${path}.canConfirmFromPool`);
    string(input.cardId, `${path}.cardId`);
    string(input.cardName, `${path}.cardName`);
    string(input.manaCost, `${path}.manaCost`);
  }
}

function validatePrompt(value, path) {
  const prompt = object(value, path);
  number(prompt.promptId, `${path}.promptId`);
  string(prompt.decidingPlayerId, `${path}.decidingPlayerId`);
  validatePromptInput(prompt.input, `${path}.input`);
}

function validateGameView(value, path) {
  const view = object(value, path);
  string(view.gameId, `${path}.gameId`);
  number(view.turn, `${path}.turn`);
  string(view.step, `${path}.step`);
  string(view.activePlayerId, `${path}.activePlayerId`);
  optional(view.priorityPlayerId, string, `${path}.priorityPlayerId`);
  boolean(view.gameOver, `${path}.gameOver`);
  array(view.players, `${path}.players`).forEach((value, index) => {
    const player = object(value, `${path}.players[${index}]`);
    string(player.id, `${path}.players[${index}].id`);
    string(player.name, `${path}.players[${index}].name`);
    number(player.life, `${path}.players[${index}].life`);
  });
  array(view.zones, `${path}.zones`).forEach((value, index) => {
    const zone = object(value, `${path}.zones[${index}]`);
    string(zone.zone, `${path}.zones[${index}].zone`);
    string(zone.ownerId, `${path}.zones[${index}].ownerId`);
    number(zone.count, `${path}.zones[${index}].count`);
    array(zone.cards, `${path}.zones[${index}].cards`);
  });
  array(view.stack, `${path}.stack`);
}

export function parseEngineEnvelope(value) {
  const envelope = object(value, "state");
  const kind = string(envelope.kind, "state.kind");
  if (kind === "state") {
    // Full states occasionally arrive without a fingerprint (BOT-002 live run,
    // e.g. broadcast finals); keep it optional so those states still parse.
    optional(envelope.fingerprint, string, "state.fingerprint");
    optional(envelope.forPlayer, string, "state.forPlayer");
    const state = object(envelope.state, "state.state");
    validateGameView(state.gameView, "state.state.gameView");
  } else if (kind === "stateDelta") {
    string(envelope.base, "state.base");
    string(envelope.fingerprint, "state.fingerprint");
    if (!("patch" in envelope)) fail("state.patch", "present value");
  } else if (kind === "roomRelay") {
    // Relay-propagated room payloads from self-hosted nodes (heartbeats,
    // spawnBot broadcasts), observed live in the BOT-002 run. Field checks
    // stay tolerant because heartbeat variants may omit optional fields.
    optional(envelope.protocol, string, "state.protocol");
    optional(envelope.version, number, "state.version");
    optional(envelope.messageId, string, "state.messageId");
    optional(envelope.fromPlayer, string, "state.fromPlayer");
    optional(envelope.roomId, string, "state.roomId");
    optional(envelope.payload, object, "state.payload");
  } else if (kind === "prompt") {
    string(envelope.forPlayer, "state.forPlayer");
    validatePrompt(envelope.prompt, "state.prompt");
  } else if (kind === "error" || kind === "fatal") {
    string(envelope.message, "state.message");
  } else {
    fail("state.kind", "state, stateDelta, prompt, roomRelay, error, or fatal");
  }
  return envelope;
}

export function parseRelayMessage(value) {
  const message = object(value, "message");
  const type = string(message.type, "message.type");
  if (type === "AuthResult") {
    boolean(message.success, "message.success");
  } else if (type === "RoomList") {
    array(message.rooms, "message.rooms");
  } else if (type === "RoomUpdate") {
    const room = object(message.room, "message.room");
    string(room.room_id, "message.room.room_id");
    array(room.players, "message.room.players");
  } else if (type === "GameStarted") {
    string(message.room_id, "message.room_id");
    string(message.game_id, "message.game_id");
    array(message.player_order, "message.player_order").forEach((value, index) => string(value, `message.player_order[${index}]`));
  } else if (type === "StateUpdate") {
    parseEngineEnvelope(message.state);
  } else if (type === "Error") {
    string(message.message, "message.message");
  }
  return message;
}

export function makePromptResponse(fromPlayer, promptId, actionType, output) {
  string(fromPlayer, "fromPlayer");
  number(promptId, "promptId");
  string(actionType, "actionType");
  const outputObject = object(output, "output");
  string(outputObject.type, "output.type");
  return {
    type: "BroadcastState",
    state: { kind: "response", fromPlayer, promptId, action: { type: actionType, output: outputObject } },
    target_player: null,
  };
}

