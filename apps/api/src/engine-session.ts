import {
  importCommanderDeck,
  toManabrewDeckSelection,
  type AgentPrompt,
  type GameViewDto,
  type GameRespondRequest,
  type GameRespondResult,
  type EngineConnectionStatus,
  type GameSnapshotDto,
} from "@mtg-commander/shared";

/**
 * UI-003: interactive relay session for the human seat.
 *
 * The proven BOT-002 flow (listRooms -> joinRoom -> setDeckSelection ->
 * spawnBots -> setReady -> startGame) ported into the API so the browser can
 * observe the live game and answer prompts through HTTP. The engine stays the
 * single rules authority; the session only forwards what the relay sends.
 */

export interface RelaySessionClient {
  on(event: string, handler: (payload: unknown) => void): void;
  listRooms(): void;
  joinRoom(options: { roomId: string; password?: string }): void;
  setDeckSelection(selection: Record<string, unknown>): void;
  setReady(ready: boolean): void;
  spawnBots(options: { roomId: string; decks: unknown[] }): void;
  startGame(format?: string): void;
  requestResync(): void;
  respond(options: {
    fromPlayer: string;
    promptId: number;
    actionType: string;
    output: Record<string, unknown>;
  }): void;
}

export interface SessionDeckConfig {
  deckText: string;
  owner: string;
  name: string;
  commanderName: string;
}

export interface InteractiveSessionConfig {
  username: string;
  roomName: string;
  roomPassword: string;
  /** null = observe only (no deck selection, no ready, no bot spawn). */
  deck: SessionDeckConfig | null;
  spawnBots: boolean;
  botCount: number;
  /**
   * UI-004 stage 1: answer chooseAction prompts without legal actions
   * automatically with `pass` (default: true) so priority checks during bot
   * turns never block the browser.
   */
  autoPass?: boolean;
}

interface SessionState {
  roomId: string | null;
  gameId: string | null;
  viewerSlot: string | null;
  gameEnded: boolean;
  gameView: GameViewDto | null;
  activePrompt: AgentPrompt | null;
  lastError: string | null;
}

function resolvedDeck(config: InteractiveSessionConfig): Record<string, unknown> | null {
  if (!config.deck) return null;
  const imported = importCommanderDeck(config.deck.deckText, {
    owner: config.deck.owner,
    name: config.deck.name,
    commanderNames: [config.deck.commanderName],
    sourceUrl: null,
    importedAt: new Date().toISOString(),
  });
  if (!imported.ok) return null;
  return toManabrewDeckSelection(imported.deck) as unknown as Record<string, unknown>;
}

interface RelayMessage {
  type?: string;
  [key: string]: unknown;
}

interface RoomPlayer {
  username?: string;
  connected?: boolean;
  ready?: boolean;
  selected_deck_name?: string | null;
  is_bot?: boolean;
}

interface RoomPayload {
  room_id?: string;
  room_name?: string;
  status?: string;
  players?: RoomPlayer[];
}

interface StateEnvelopeLike {
  kind?: string;
  forPlayer?: string;
  prompt?: AgentPrompt;
  state?: { gameView?: GameViewDto; [key: string]: unknown };
  message?: string;
}

export function createInteractiveSession(
  client: RelaySessionClient,
  config: InteractiveSessionConfig,
  log: (message: string) => void = () => {},
) {
  const selection = resolvedDeck(config);
  if (config.deck && !selection) {
    log(`[session] deck import failed for ${config.deck.name}; observing room without playing`);
  }
  const botSelections = Array.from({ length: config.botCount }, (_, index) => {
    const deck = (selection as { deck?: unknown } | null)?.deck ?? null;
    return {
      deckName: `${config.deck?.name ?? "Deck"} Bot ${index + 1}`,
      deck,
      commanderName: config.deck?.commanderName ?? "",
    };
  });

  const state: SessionState = {
    roomId: null,
    gameId: null,
    viewerSlot: null,
    gameEnded: false,
    gameView: null,
    activePrompt: null,
    lastError: null,
  };

  const answeredPromptIds = new Set<number>();
  let autoPassEnabled = config.autoPass !== false;
  let deckRequested = false;
  let readyRequested = false;
  let botsRequested = false;
  let startSent = false;

  function resetLobbyFlags(): void {
    deckRequested = false;
    readyRequested = false;
    botsRequested = false;
    startSent = false;
  }

  function maybeStartGame(room: RoomPayload): void {
    if (startSent || room.status !== "Lobby") return;
    const players = Array.isArray(room.players) ? room.players : [];
    if (players.length < config.botCount + 1) return;
    if (!players.every((player) => player.connected && player.ready && player.selected_deck_name)) {
      return;
    }
    startSent = true;
    log(`[session] starting Commander game with ${players.length} players`);
    client.startGame("Commander");
  }

  function handleRoomUpdate(room: RoomPayload): void {
    if (!room.room_id) return;
    state.roomId = room.room_id;
    const players = Array.isArray(room.players) ? room.players : [];
    const me = players.find((player) => player.username === config.username);
    if (!me) return;

    if (
      config.spawnBots &&
      config.deck &&
      selection &&
      !botsRequested &&
      room.status === "Lobby" &&
      players.filter((player) => player.is_bot).length < config.botCount
    ) {
      botsRequested = true;
      log(`[session] spawning ${config.botCount} bots with deck ${config.deck.name}`);
      client.spawnBots({ roomId: room.room_id, decks: botSelections });
    }
    if (config.deck && selection && !me.selected_deck_name && !deckRequested) {
      deckRequested = true;
      log(`[session] selecting deck ${config.deck.name}`);
      client.setDeckSelection(selection);
    }
    if (config.deck && selection && !me.ready && !readyRequested && me.selected_deck_name) {
      readyRequested = true;
      log("[session] marking seat ready");
      client.setReady(true);
    }
    maybeStartGame(room);
  }

  /**
   * A chooseAction prompt with zero legal actions is a pure priority check
   * (typically after a bot move): passing is the only possible answer.
   */
  function isPassOnlyPrompt(prompt: AgentPrompt): boolean {
    const input = prompt.input as { type?: unknown; actions?: unknown };
    return input.type === "chooseAction" && Array.isArray(input.actions) && input.actions.length === 0;
  }

  function autoPassPrompt(prompt: AgentPrompt): void {
    if (state.viewerSlot === null) return;
    log(`[session] auto-pass: prompt ${prompt.promptId} has no legal actions, passing`);
    client.respond({
      fromPlayer: state.viewerSlot,
      promptId: prompt.promptId,
      actionType: prompt.input.type,
      output: { type: "pass", exhaustStack: false },
    });
    answeredPromptIds.add(prompt.promptId);
    state.activePrompt = null;
  }

  function handleStateEnvelope(message: RelayMessage): void {
    const envelope = message.state as StateEnvelopeLike | null | undefined;
    if (!envelope || typeof envelope !== "object") return;

    if (envelope.kind === "state") {
      const gameView = envelope.state?.gameView;
      if (
        state.viewerSlot !== null &&
        envelope.forPlayer === state.viewerSlot &&
        gameView &&
        typeof gameView === "object"
      ) {
        state.gameView = gameView as GameViewDto;
        if (state.gameView.gameOver === true) state.gameEnded = true;
      }
      return;
    }

    if (envelope.kind === "prompt") {
      const prompt = envelope.prompt;
      const inputType = prompt?.input?.type;
      if (inputType === "gameOver") {
        state.gameEnded = true;
        state.activePrompt = null;
        return;
      }
      if (state.viewerSlot === null || envelope.forPlayer !== state.viewerSlot) return;
      const promptId = prompt?.promptId;
      if (typeof promptId === "number" && answeredPromptIds.has(promptId)) return;
      state.activePrompt = prompt ?? null;
      if (autoPassEnabled && state.activePrompt && isPassOnlyPrompt(state.activePrompt)) {
        autoPassPrompt(state.activePrompt);
      }
      return;
    }

    if (envelope.kind === "error" || envelope.kind === "fatal") {
      state.lastError = String(envelope.message ?? "unbekannter Engine-Fehler");
      log(`[session] engine error: ${state.lastError}`);
    }
  }

  function handleMessage(rawMessage: unknown): void {
    const message = rawMessage as RelayMessage;
    if (!message || typeof message !== "object") return;

    if (message.type === "AuthResult") {
      if (message.success === false) {
        state.lastError = "Relay-Authentifizierung fehlgeschlagen";
        return;
      }
      resetLobbyFlags();
      client.listRooms();
      return;
    }

    if (message.type === "RoomList") {
      const rooms = Array.isArray(message.rooms) ? message.rooms : [];
      const candidates = rooms.filter((room) => room.room_name === config.roomName);
      const lobby = candidates.find((room) => room.status === "Lobby");
      if (!lobby) {
        const knownSeat = candidates.find(
          (room) =>
            Array.isArray(room.players) &&
            room.players.some((player: { username?: string }) => player.username === config.username),
        );
        if (state.gameId || knownSeat) {
          // reconnect into a running game (dropped socket or fresh process):
          // the relay resolves the resync to our seat, no re-join needed.
          log("[session] running game found for our seat, resyncing instead of joining");
          client.requestResync();
          return;
        }
        state.lastError =
          candidates.length === 0
            ? `Raum nicht gefunden: ${config.roomName}`
            : `Alle Raeume ${config.roomName} laufen bereits (Forge-Room neu starten)`;
        log(`[session] ${state.lastError}`);
        return;
      }
      log(`[session] joining room ${lobby.room_name} (${lobby.room_id})`);
      client.joinRoom({ roomId: lobby.room_id, password: config.roomPassword });
      return;
    }

    if (message.type === "RoomUpdate") {
      handleRoomUpdate((message.room ?? {}) as RoomPayload);
      return;
    }

    if (message.type === "GameStarted") {
      const gameId = String(message.game_id ?? "");
      const isNewGame = gameId !== state.gameId;
      // Forge echoes GameStarted with every resync answer; resyncing on every
      // echo loops forever (~100+/s). Only resync a new game or a session that
      // has not received its own gameView yet (covers reconnects).
      const needsResync = isNewGame || state.gameView === null;
      state.gameId = gameId;
      state.gameEnded = false;
      if (isNewGame) state.activePrompt = null;
      const order = Array.isArray(message.player_order) ? message.player_order : [];
      const slotIndex = order.findIndex((name) => name === config.username);
      state.viewerSlot = slotIndex >= 0 ? `player-${slotIndex}` : null;
      if (needsResync) {
        log(`[session] game started ${state.gameId} as ${state.viewerSlot ?? "spectator"}`);
        client.requestResync();
      }
      return;
    }

    if (message.type === "GameEnded" || message.type === "GameOver") {
      state.gameEnded = true;
      state.activePrompt = null;
      return;
    }

    if (message.type === "StateUpdate" || message.type === "BroadcastState") {
      handleStateEnvelope(message);
      return;
    }

    if (message.type === "Error") {
      state.lastError = String(message.message ?? "unbekannter Relay-Fehler");
      log(`[session] relay error ${String(message.code ?? "unknown")}: ${state.lastError}`);
    }
  }

  client.on("message", handleMessage);

  return {
    snapshot(engineStatus: EngineConnectionStatus): GameSnapshotDto {
      return {
        engineStatus,
        humanPlayerName: config.username,
        roomId: state.roomId,
        gameId: state.gameId,
        viewerPlayerId: state.viewerSlot,
        gameEnded: state.gameEnded,
        gameView: state.gameView,
        prompt: state.activePrompt,
        autoPass: autoPassEnabled,
        lastError: state.lastError,
      };
    },
    respond(request: GameRespondRequest): GameRespondResult {
      if (state.viewerSlot === null) {
        return { ok: false, error: "Diese Sitz hat noch keinen Spielplatz (Spiel nicht gestartet)." };
      }
      const prompt = state.activePrompt;
      if (!prompt) {
        return { ok: false, error: "Kein offener Prompt fuer deinen Sitz." };
      }
      if (prompt.promptId !== request.promptId) {
        return {
          ok: false,
          error: `Prompt ${request.promptId} ist nicht mehr aktiv (erwartet: ${prompt.promptId}).`,
        };
      }
      const expectedType = prompt.input.type;
      if (request.actionType !== expectedType) {
        return {
          ok: false,
          error: `actionType ${request.actionType} passt nicht zum Prompt ${expectedType}.`,
        };
      }
      client.respond({
        fromPlayer: state.viewerSlot,
        promptId: request.promptId,
        actionType: request.actionType,
        output: request.output,
      });
      answeredPromptIds.add(request.promptId);
      state.activePrompt = null;
      return { ok: true };
    },
    setAutoPass(enabled: boolean): GameRespondResult {
      autoPassEnabled = enabled;
      log(`[session] auto-pass ${enabled ? "enabled" : "disabled"}`);
      // enabling auto-pass immediately clears a pending action-free prompt
      if (enabled && state.activePrompt && isPassOnlyPrompt(state.activePrompt)) {
        autoPassPrompt(state.activePrompt);
      }
      return { ok: true };
    },
  };
}

export type InteractiveSession = ReturnType<typeof createInteractiveSession>;

