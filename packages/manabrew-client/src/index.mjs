import { makePromptResponse, parseRelayMessage } from "@mtg-commander/shared/protocol-parser";

const OPEN = 1;

function defaultWebSocketFactory(url) {
  return new WebSocket(url);
}

function decodeMessageData(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  return String(data);
}

export class ManabrewRelayClient {
  #options;
  #listeners = new Map();
  #socket = null;
  #generation = 0;
  #reconnectTimer = null;
  #manualClose = false;
  #authenticationRejected = false;
  #status = "idle";
  #reconnectAttempt = 0;
  #lastError = null;
  #lastMessageAt = null;
  #playerId = null;
  #room = null;
  #game = null;
  #latestStates = new Map();
  #activePrompts = new Map();

  constructor(options) {
    if (!options?.url) throw new TypeError("Manabrew relay URL is required");
    if (!options?.username) throw new TypeError("Manabrew username is required");
    if (!options?.password) throw new TypeError("Manabrew password is required");

    this.#options = {
      identity: null,
      service: false,
      clientPlatform: "server",
      clientVersion: null,
      reconnect: true,
      reconnectMinDelayMs: 250,
      reconnectMaxDelayMs: 10_000,
      reconnectMaxAttempts: Number.POSITIVE_INFINITY,
      webSocketFactory: defaultWebSocketFactory,
      ...options,
    };
  }

  get status() {
    return this.#status;
  }

  get connected() {
    return this.#status === "authenticated";
  }

  get snapshot() {
    return {
      status: this.#status,
      connected: this.connected,
      reconnectAttempt: this.#reconnectAttempt,
      playerId: this.#playerId,
      roomId: this.#room?.room_id ?? null,
      gameId: this.#game?.game_id ?? null,
      lastMessageAt: this.#lastMessageAt,
      lastError: this.#lastError,
    };
  }

  get room() {
    return this.#room;
  }

  get game() {
    return this.#game;
  }

  latestState(forPlayer) {
    return this.#latestStates.get(forPlayer ?? null) ?? null;
  }

  activePrompt(forPlayer) {
    return this.#activePrompts.get(forPlayer) ?? null;
  }

  on(eventName, listener) {
    const listeners = this.#listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(eventName, listeners);
    return () => listeners.delete(listener);
  }

  connect() {
    if (["connecting", "authenticating", "authenticated", "reconnecting"].includes(this.#status)) {
      return;
    }
    this.#manualClose = false;
    this.#authenticationRejected = false;
    this.#reconnectAttempt = 0;
    this.#openSocket(false);
  }

  close(code = 1000, reason = "client closed") {
    this.#manualClose = true;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    this.#setStatus("closed");
    try {
      this.#socket?.close(code, reason);
    } catch (error) {
      this.#emitError(error);
    }
  }

  send(message) {
    if (!this.#socket || this.#socket.readyState !== OPEN) {
      throw new Error(`Cannot send Manabrew message while client is ${this.#status}`);
    }
    this.#socket.send(JSON.stringify(message));
    this.#emit("send", message);
  }

  listRooms() {
    this.send({ type: "ListRooms" });
  }

  joinRoom({ roomId, password = "", observe = false, asBot = false }) {
    this.send({
      type: "JoinRoom",
      room_id: roomId,
      observe,
      as_bot: asBot,
      password,
    });
  }

  setDeckSelection({
    deckName,
    deck,
    publishedDeckId = null,
    commanderName = null,
    avatarUrl = null,
  }) {
    this.send({
      type: "SetDeckSelection",
      deck_name: deckName,
      deck,
      published_deck_id: publishedDeckId,
      commander_name: commanderName,
      avatar_url: avatarUrl,
    });
  }

  setReady(ready = true) {
    this.send({ type: "SetReady", ready });
  }

  spawnBots({ roomId, decks, fromPlayer = this.#options.username }) {
    if (!Array.isArray(decks) || decks.length === 0) {
      throw new TypeError("spawnBots requires at least one deck selection");
    }
    this.broadcastRoomPayload({
      roomId,
      fromPlayer,
      payload: { type: "spawnBot", deck: decks[0], decks },
    });
  }

  broadcastRoomPayload({ roomId, payload, fromPlayer = this.#options.username }) {
    this.send({
      type: "BroadcastState",
      state: {
        kind: "roomRelay",
        protocol: "self-hosted-node",
        version: 1,
        messageId: crypto.randomUUID(),
        fromPlayer,
        roomId,
        payload,
      },
      target_player: null,
    });
  }

  startGame(format = "Commander") {
    this.send({ type: "StartGame", format });
  }

  requestResync() {
    this.send({ type: "RequestResync" });
  }

  respond({ fromPlayer, promptId, actionType, output }) {
    this.send(makePromptResponse(fromPlayer, promptId, actionType, output));
  }

  #openSocket(isReconnect) {
    const generation = ++this.#generation;
    this.#setStatus(isReconnect ? "reconnecting" : "connecting");

    let socket;
    try {
      socket = this.#options.webSocketFactory(this.#options.url);
    } catch (error) {
      this.#emitError(error);
      this.#scheduleReconnect();
      return;
    }

    this.#socket = socket;
    socket.addEventListener("open", () => {
      if (generation !== this.#generation) return;
      this.#setStatus("authenticating");
      this.send({
        type: "Authenticate",
        username: this.#options.username,
        password: this.#options.password,
        service: this.#options.service,
        identity: this.#options.identity,
        client_platform: this.#options.clientPlatform,
        client_version: this.#options.clientVersion,
      });
    });

    socket.addEventListener("message", (event) => {
      if (generation !== this.#generation) return;
      this.#handleRawMessage(event.data);
    });

    socket.addEventListener("error", (event) => {
      if (generation !== this.#generation) return;
      this.#emitError(event?.error ?? new Error(event?.message ?? "Manabrew WebSocket error"));
    });

    socket.addEventListener("close", (event) => {
      if (generation !== this.#generation) return;
      this.#emit("close", { code: event?.code ?? null, reason: event?.reason ?? "" });
      if (this.#manualClose || this.#authenticationRejected) return;
      this.#scheduleReconnect();
    });
  }

  #handleRawMessage(data) {
    const raw = decodeMessageData(data);
    let decoded;
    try {
      decoded = JSON.parse(raw);
    } catch (error) {
      this.#emit("invalidMessage", { raw, error });
      return;
    }

    let message;
    try {
      message = parseRelayMessage(decoded);
    } catch (error) {
      this.#emit("invalidMessage", { raw, decoded, error });
      return;
    }

    this.#lastMessageAt = new Date().toISOString();
    this.#trackMessage(message);
    this.#emit("message", message);
  }

  #trackMessage(message) {
    if (message.type === "AuthResult") {
      if (message.success) {
        this.#playerId = message.player_id ?? null;
        this.#reconnectAttempt = 0;
        this.#lastError = null;
        this.#setStatus("authenticated");
      } else {
        this.#authenticationRejected = true;
        this.#lastError = message.error ?? "Relay authentication failed";
        this.#setStatus("authFailed");
        try {
          this.#socket?.close(4001, "authentication failed");
        } catch {}
      }
      return;
    }

    if (message.type === "RoomUpdate") {
      this.#room = message.room;
      return;
    }

    if (message.type === "GameStarted") {
      this.#game = message;
      return;
    }

    if (message.type === "Error") {
      this.#lastError = message.message;
      this.#emit("relayError", message);
      return;
    }

    if (message.type !== "StateUpdate") return;
    const envelope = message.state;
    if (envelope.kind === "state") {
      this.#latestStates.set(envelope.forPlayer ?? null, envelope);
      this.#emit("state", envelope);
    } else if (envelope.kind === "stateDelta") {
      this.#emit("stateDelta", envelope);
    } else if (envelope.kind === "prompt") {
      this.#activePrompts.set(envelope.forPlayer, envelope);
      this.#emit("prompt", envelope);
    } else if (envelope.kind === "error" || envelope.kind === "fatal") {
      this.#lastError = envelope.message;
      this.#emit("engineError", envelope);
    }
  }

  #scheduleReconnect() {
    if (this.#manualClose || !this.#options.reconnect) {
      this.#setStatus("closed");
      return;
    }

    this.#reconnectAttempt += 1;
    if (this.#reconnectAttempt > this.#options.reconnectMaxAttempts) {
      this.#setStatus("failed");
      return;
    }

    const exponential = this.#options.reconnectMinDelayMs * 2 ** (this.#reconnectAttempt - 1);
    const delayMs = Math.min(exponential, this.#options.reconnectMaxDelayMs);
    this.#setStatus("reconnecting");
    this.#emit("reconnectScheduled", { attempt: this.#reconnectAttempt, delayMs });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#openSocket(true);
    }, delayMs);
  }

  #setStatus(status) {
    if (this.#status === status) return;
    this.#status = status;
    this.#emit("status", this.snapshot);
  }

  #emitError(error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.#lastError = normalized.message;
    this.#emit("error", normalized);
  }

  #emit(eventName, value) {
    for (const listener of this.#listeners.get(eventName) ?? []) {
      try {
        listener(value);
      } catch (error) {
        if (eventName !== "error") this.#emitError(error);
      }
    }
  }
}
