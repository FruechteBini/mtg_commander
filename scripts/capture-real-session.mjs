#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ManabrewRelayClient } from "@mtg-commander/manabrew-client";

const relayUrl = process.env.MANABREW_RELAY_URL ?? "ws://localhost:9443";
const serverKey = process.env.MANABREW_SERVER_KEY ?? "local-dev-change-me";
const roomName = process.env.MANABREW_ROOM_NAME ?? "MTG-Commander PoC";
const roomPassword = process.env.MANABREW_ROOM_PASSWORD ?? "local-dev";
const minPlayersToStart = Number(process.env.MANABREW_CAPTURE_MIN_PLAYERS ?? 4);
const targetSpellName = process.env.MANABREW_CAPTURE_SPELL ?? "Shock";
const username = process.env.MANABREW_CAPTURE_USERNAME ?? `capture-player-${Date.now()}`;
const captureDir = path.resolve("captures");
const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
const capturePath = path.join(captureDir, `manabrew-real-session-${startedAt}.jsonl`);
const summaryPath = path.join(captureDir, `manabrew-real-session-${startedAt}.summary.json`);

const summary = {
  relayUrl,
  roomName,
  username,
  startedAt,
  capturePath,
  events: [],
  counts: {},
  roomId: null,
  gameId: null,
  playerOrder: null,
  mySlot: null,
  prompts: [],
  states: [],
  chooseActions: [],
  chooseAction: null,
  multistepAction: {
    targetSpellName,
    status: "seeking-action",
    promptChain: [],
  },
  errors: [],
};

fs.mkdirSync(captureDir, { recursive: true });

let client;
let done = false;
let sentStart = false;
let mySlot = null;
let promptResponses = 0;
let stateMessages = 0;
let promptMessages = 0;
let payManaPromptMessages = 0;
let lastPromptKeys = new Set();
let actionResponseSent = false;
let actionBaseFingerprint = null;
let pendingActionProof = null;
let targetPlayerId = null;
let targetLifeBefore = null;
const fingerprintsByPerspective = new Map();
const gameViewsByPerspective = new Map();
let botSpawnRequested = false;
let deckSelectionRequested = false;
let readyRequested = false;
let gameStartedSeen = false;

function record(direction, message) {
  const recordedMessage =
    direction === "out" && message?.type === "Authenticate"
      ? { ...message, password: "[redacted]" }
      : message;
  const entry = {
    at: new Date().toISOString(),
    direction,
    type: recordedMessage?.type ?? recordedMessage?.kind ?? "unknown",
    message: recordedMessage,
  };
  fs.appendFileSync(capturePath, `${JSON.stringify(entry)}\n`);
  summary.counts[entry.type] = (summary.counts[entry.type] ?? 0) + 1;
}

function note(event, data = {}) {
  const item = { at: new Date().toISOString(), event, ...data };
  summary.events.push(item);
  console.log(`[capture] ${event}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ""}`);
}

function commanderDeck(name) {
  const cards = [];
  for (let i = 0; i < 50; i += 1) cards.push(card(`mountain-${i}`, "Mountain"));
  for (let i = 0; i < 49; i += 1) cards.push(card(`shock-${i}`, targetSpellName));
  const commander = card("neheb-the-worthy", "Neheb, the Worthy");
  return {
    name,
    format: "commander",
    cards,
    commanders: [commander],
  };
}

function card(id, name) {
  return {
    identity: {
      id,
      name,
      setCode: "",
      cardNumber: "0",
    },
  };
}

function botDeckSelections(count) {
  return Array.from({ length: count }, (_, index) => ({
    deckName: `Capture Bot ${index + 1}`,
    deck: commanderDeck(`Capture Bot ${index + 1}`),
    commanderName: "Neheb, the Worthy",
  }));
}

function captureDeckSelection() {
  return {
    deckName: "Capture Player",
    deck: commanderDeck("Capture Player"),
    publishedDeckId: null,
    commanderName: "Neheb, the Worthy",
    avatarUrl: null,
  };
}

function compactStateProof(gameView, cardId, trackedPlayerId = null) {
  if (!gameView) return null;
  let cardZone = cardId
    ? gameView.zones?.find((zone) =>
        zone.cards?.some(
          (cardView) => cardView.id === cardId || cardView.card?.id === cardId,
        ),
      )?.zone ?? null
    : null;
  if (
    !cardZone &&
    cardId &&
    gameView.stack?.some(
      (item) =>
        item.source?.id === cardId ||
        item.source?.card?.id === cardId ||
        item.card?.id === cardId,
    )
  ) {
    cardZone = "stack";
  }
  const trackedPlayer = trackedPlayerId
    ? gameView.players?.find((player) => player.id === trackedPlayerId)
    : null;
  return {
    turn: gameView.turn ?? gameView.turnNumber ?? null,
    step: gameView.step ?? null,
    activePlayerId: gameView.activePlayerId ?? null,
    priorityPlayerId: gameView.priorityPlayerId ?? null,
    cardId: cardId ?? null,
    cardZone,
    stackDepth: gameView.stack?.length ?? 0,
    trackedPlayerId,
    trackedPlayerLife: trackedPlayer?.life ?? null,
  };
}

function isTargetSpellAction(action) {
  const label = action?.label ?? action?.modeLabel ?? action?.description ?? "";
  return label.toLowerCase().includes(targetSpellName.toLowerCase());
}

function promptResponse(forPlayer, prompt) {
  const input = prompt?.input ?? {};
  const promptId = prompt?.promptId ?? prompt?.prompt_id;
  const type = input?.type;

  if (typeof promptId !== "number") return null;

  if (type === "mulligan") {
    return response(forPlayer, promptId, {
      type: "mulligan",
      output: { type: "mulliganDecision", keep: true },
    });
  }

  if (type === "mulliganPutBack") {
    const cardIds = Array.isArray(input.handCardIds)
      ? input.handCardIds.slice(0, input.count ?? 0)
      : [];
    return response(forPlayer, promptId, {
      type: "mulliganPutBack",
      output: { type: "mulliganPutBackDecision", cardIds },
    });
  }

  if (type === "chooseAction") {
    const actions = Array.isArray(input.actions) ? input.actions : [];
    const firstAction =
      actions.find(isTargetSpellAction) ??
      actions.find((action) => action.type === "playLand") ??
      actions.find((action) => /^Play\s/i.test(action.label ?? "")) ??
      null;
    return response(forPlayer, promptId, {
      type: "chooseAction",
      output: firstAction
        ? { type: "act", actionId: firstAction.id }
        : { type: "pass", exhaustStack: false },
    });
  }

  if (type === "payManaCost") {
    const manaAction = Array.isArray(input.actions) ? input.actions[0] : null;
    return response(forPlayer, promptId, {
      type: "payManaCost",
      output: input.canConfirmFromPool
        ? { type: "pay", auto: false }
        : manaAction
          ? { type: "act", actionId: manaAction.id }
          : { type: "cancel" },
    });
  }

  if (type === "chooseBoardTargets") {
    const candidates = Array.isArray(input.candidates) ? input.candidates : [];
    const chosen =
      candidates.find(
        (candidate) => candidate.kind === "player" && candidate.id !== mySlot,
      ) ?? candidates[0];
    if (!chosen && input.cancellable) {
      return response(forPlayer, promptId, {
        type: "chooseBoardTargets",
        output: { type: "cancel" },
      });
    }
    if (!chosen) return null;
    return response(forPlayer, promptId, {
      type: "chooseBoardTargets",
      output: { type: "boardTargets", chosen: [chosen] },
    });
  }

  if (type === "diceRolled") {
    return response(forPlayer, promptId, {
      type: "diceRolled",
      output: { type: "diceRolledAcknowledged" },
    });
  }

  return null;
}

function response(fromPlayer, promptId, action) {
  return {
    fromPlayer,
    promptId,
    actionType: action.type,
    output: action.output,
  };
}

function maybeStart(room) {
  if (sentStart || room.status !== "Lobby") return;
  if (room.players.length < minPlayersToStart) return;
  if (!room.players.every((player) => player.connected && player.ready && player.selected_deck_name)) return;

  sentStart = true;
  note("starting-game", { players: room.players.map((player) => player.username) });
  client.startGame("Commander");
}

function maybeFinishMultistepProof(gameView, fingerprint) {
  if (!actionResponseSent || !pendingActionProof || !gameView) return;
  const after = compactStateProof(
    gameView,
    pendingActionProof.selectedAction?.cardId,
    targetPlayerId,
  );
  summary.multistepAction.latestState = after;
  const targetWasDamaged =
    typeof targetLifeBefore === "number" &&
    typeof after?.trackedPlayerLife === "number" &&
    after.trackedPlayerLife < targetLifeBefore;
  const spellResolved = after?.cardZone === "graveyard";
  if (!targetWasDamaged || !spellResolved) return;

  pendingActionProof.confirmedBy = "resolved-state";
  pendingActionProof.resultFingerprint = fingerprint;
  pendingActionProof.stateAfterAction = after;
  summary.multistepAction.status = "resolved";
  summary.multistepAction.resultFingerprint = fingerprint;
  summary.multistepAction.stateAfterResolution = after;
  summary.multistepAction.lifeLost = targetLifeBefore - after.trackedPlayerLife;
  void finish("captured-multistep-spell-loop");
}

async function finish(reason) {
  if (done) return;
  done = true;
  note("finished", { reason });
  summary.finishedAt = new Date().toISOString();
  summary.reason = reason;
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  try {
    client.close();
  } catch {}
  setTimeout(() => process.exit(0), 25).unref();
}

function handleStateEnvelope(serverMessage) {
  const envelope = serverMessage.state;
  if (!envelope || typeof envelope !== "object") return;

  if (envelope.kind === "state") {
    stateMessages += 1;
    const fingerprint = envelope.fingerprint ?? null;
    const perspective = envelope.forPlayer ?? null;
    if (fingerprint) fingerprintsByPerspective.set(perspective, fingerprint);
    const gameView = envelope.state?.gameView ?? null;
    if (gameView) gameViewsByPerspective.set(perspective, gameView);
    summary.states.push({
      index: stateMessages,
      forPlayer: envelope.forPlayer,
      hasFingerprint: Boolean(envelope.fingerprint),
      fingerprint,
      keys: envelope.state ? Object.keys(envelope.state).slice(0, 20) : [],
    });
    if (perspective === mySlot && fingerprint) {
      maybeFinishMultistepProof(gameView, fingerprint);
    }
    return;
  }

  if (envelope.kind === "stateDelta") {
    const perspective = envelope.forPlayer ?? null;
    if (envelope.fingerprint) {
      fingerprintsByPerspective.set(perspective, envelope.fingerprint);
    }
    summary.states.push({
      index: stateMessages + 1,
      kind: "stateDelta",
      forPlayer: envelope.forPlayer,
      base: envelope.base,
      fingerprint: envelope.fingerprint,
    });
    return;
  }

  if (envelope.kind === "prompt") {
    promptMessages += 1;
    const inputType = envelope.prompt?.input?.type ?? "unknown";
    if (inputType === "payManaCost") {
      payManaPromptMessages += 1;
      if (payManaPromptMessages > 10) {
        summary.errors.push({
          type: "capturePromptLoop",
          inputType,
          count: payManaPromptMessages,
        });
        void finish("prompt-loop-guard");
        return;
      }
    }
    summary.prompts.push({
      index: promptMessages,
      forPlayer: envelope.forPlayer,
      promptId: envelope.prompt?.promptId ?? envelope.prompt?.prompt_id,
      inputType,
    });

    if (mySlot && envelope.forPlayer === mySlot) {
      const key = JSON.stringify(envelope.prompt);
      if (!lastPromptKeys.has(key)) {
        lastPromptKeys.add(key);
        const outbound = promptResponse(envelope.forPlayer, envelope.prompt);
        if (outbound) {
          promptResponses += 1;
          const output = outbound.output;
          note("answering-prompt", { inputType, promptResponses, outputType: output?.type });
          if (inputType === "chooseAction") {
            const availableActions = (envelope.prompt?.input?.actions ?? []).map((action) => ({
              id: action.id,
              type: action.type,
              cardId: action.cardId ?? null,
              label: action.label ?? action.modeLabel ?? action.description ?? null,
              mode: action.mode ?? null,
            }));
            const selectedAction = availableActions.find(
              (action) => action.id === output?.actionId,
            ) ?? null;
            const actionProof = {
              promptId: envelope.prompt?.promptId ?? envelope.prompt?.prompt_id,
              availableActions,
              selectedAction,
              response: output,
              baseFingerprint: fingerprintsByPerspective.get(mySlot) ?? null,
              confirmedBy: null,
              resultFingerprint: null,
              stateBeforeAction: compactStateProof(
                gameViewsByPerspective.get(mySlot),
                selectedAction?.cardId,
              ),
              stateAfterAction: null,
            };
            summary.chooseActions.push(actionProof);
            summary.chooseAction = actionProof;
            if (output?.type === "act" && isTargetSpellAction(selectedAction)) {
              actionResponseSent = true;
              actionBaseFingerprint = actionProof.baseFingerprint;
              pendingActionProof = actionProof;
              summary.multistepAction.status = "casting";
              summary.multistepAction.castPromptId = actionProof.promptId;
              summary.multistepAction.selectedAction = selectedAction;
              summary.multistepAction.baseFingerprint = actionBaseFingerprint;
              summary.multistepAction.stateBeforeCast = compactStateProof(
                gameViewsByPerspective.get(mySlot),
                selectedAction?.cardId,
              );
              note("action-proof-started", {
                actionId: output.actionId,
                actionType: selectedAction?.type,
                actionLabel: selectedAction?.label,
                baseFingerprint: actionBaseFingerprint,
              });
            }
          }
          if (actionResponseSent) {
            const proofStep = {
              promptId: envelope.prompt?.promptId ?? envelope.prompt?.prompt_id,
              inputType,
              output,
            };
            if (inputType === "payManaCost") {
              proofStep.manaCost = envelope.prompt?.input?.manaCost ?? null;
              proofStep.canConfirmFromPool = Boolean(
                envelope.prompt?.input?.canConfirmFromPool,
              );
            }
            if (inputType === "chooseBoardTargets") {
              const chosen = output?.chosen?.[0] ?? null;
              proofStep.chosenTarget = chosen;
              if (chosen?.kind === "player") {
                targetPlayerId = chosen.id;
                targetLifeBefore = gameViewsByPerspective
                  .get(mySlot)
                  ?.players?.find((player) => player.id === targetPlayerId)?.life ?? null;
                summary.multistepAction.target = chosen;
                summary.multistepAction.targetLifeBefore = targetLifeBefore;
              }
            }
            summary.multistepAction.promptChain.push(proofStep);
          }
          client.respond(outbound);
        } else {
          note("unsupported-prompt", { inputType });
        }
      }
    }

    return;
  }

  if (envelope.kind === "error" || envelope.kind === "fatal") {
    summary.errors.push(envelope);
    if (actionResponseSent) void finish("multistep-action-rejected");
  }
}

async function main() {
  note("connecting", { relayUrl });
  client = new ManabrewRelayClient({
    url: relayUrl,
    username,
    password: serverKey,
    clientPlatform: "unknown",
    clientVersion: "0.1.0",
    reconnect: true,
    reconnectMinDelayMs: 250,
    reconnectMaxDelayMs: 2_000,
    reconnectMaxAttempts: 3,
  });

  client.on("send", (message) => record("out", message));
  client.on("message", (message) => {
    record("in", message);

    if (message.type === "AuthResult") {
      if (!message.success) {
        summary.errors.push(message);
        void finish("auth-failed");
        return;
      }
      note("authenticated", { username: message.username ?? username });
      client.listRooms();
      return;
    }

    if (message.type === "RoomList") {
      const room = message.rooms.find((candidate) => candidate.room_name === roomName);
      if (!room) {
        summary.errors.push({ message: `Room not found: ${roomName}`, rooms: message.rooms });
        void finish("room-not-found");
        return;
      }
      summary.roomId = room.room_id;
      note("joining-room", { roomId: room.room_id, roomName: room.room_name });
      client.joinRoom({
        roomId: room.room_id,
        password: roomPassword,
      });
      return;
    }

    if (message.type === "RoomUpdate") {
      const room = message.room;
      if (room?.room_id) summary.roomId = room.room_id;

      const playerNames = room.players.map((player) => player.username);
      const botCount = room.players.filter((player) => player.is_bot).length;
      const hasMe = playerNames.includes(username);

      if (hasMe && botCount < 3 && room.status === "Lobby" && !botSpawnRequested) {
        botSpawnRequested = true;
        const requested = 3 - botCount;
        note("spawning-bots", { requested });
        client.spawnBots({
          roomId: room.room_id,
          decks: botDeckSelections(requested),
        });
      }

      const me = room.players.find((player) => player.username === username);
      if (me && !me.selected_deck_name && !deckSelectionRequested) {
        deckSelectionRequested = true;
        note("selecting-deck");
        client.setDeckSelection(captureDeckSelection());
      }
      if (me && !me.ready && !readyRequested && me.selected_deck_name) {
        readyRequested = true;
        note("setting-ready");
        client.setReady(true);
      }

      maybeStart(room);
      return;
    }

    if (message.type === "GameStarted") {
      if (gameStartedSeen) return;
      gameStartedSeen = true;
      summary.gameId = message.game_id;
      summary.playerOrder = message.player_order;
      mySlot = message.player_order.findIndex((player) => player === username);
      mySlot = mySlot >= 0 ? `player-${mySlot}` : null;
      summary.mySlot = mySlot;
      note("game-started", { gameId: message.game_id, mySlot });
      client.requestResync();
      return;
    }

    if (message.type === "StateUpdate") {
      handleStateEnvelope(message);
      return;
    }

    if (message.type === "Error") {
      summary.errors.push(message);
      note("relay-error", { code: message.code, message: message.message });
    }
  });

  client.on("invalidMessage", ({ raw, error }) => {
    record("in", { type: "unparsed", raw });
    summary.errors.push({ type: "invalid-message", message: String(error?.message ?? error) });
  });
  client.on("error", (error) => {
    summary.errors.push({ type: "websocket-error", message: String(error?.message ?? error) });
  });
  client.on("reconnectScheduled", ({ attempt, delayMs }) => {
    note("reconnect-scheduled", { attempt, delayMs });
  });
  client.on("status", ({ status }) => {
    if (status === "failed" && !done) void finish("reconnect-exhausted");
  });

  client.connect();

  await delay(Number(process.env.MANABREW_CAPTURE_TIMEOUT_MS ?? 90000));
  await finish("timeout");
}

await main();
