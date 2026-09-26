export type RelayClientStatus =
  | "idle"
  | "connecting"
  | "authenticating"
  | "authenticated"
  | "reconnecting"
  | "authFailed"
  | "failed"
  | "closed";

export interface RelayClientSnapshot {
  status: RelayClientStatus;
  connected: boolean;
  reconnectAttempt: number;
  playerId: string | null;
  roomId: string | null;
  gameId: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
}

export interface ManabrewRelayClientOptions {
  url: string;
  username: string;
  password: string;
  identity?: string | null;
  service?: boolean;
  clientPlatform?: "web" | "pwa" | "desktop" | "mobile" | "unknown";
  clientVersion?: string | null;
  reconnect?: boolean;
  reconnectMinDelayMs?: number;
  reconnectMaxDelayMs?: number;
  reconnectMaxAttempts?: number;
  webSocketFactory?: (url: string) => WebSocket;
}

export type RelayClientEvent =
  | "status"
  | "message"
  | "send"
  | "invalidMessage"
  | "error"
  | "close"
  | "reconnectScheduled"
  | "relayError"
  | "state"
  | "stateDelta"
  | "prompt"
  | "engineError";

export class ManabrewRelayClient {
  constructor(options: ManabrewRelayClientOptions);
  get status(): RelayClientStatus;
  get connected(): boolean;
  get snapshot(): RelayClientSnapshot;
  get room(): Record<string, unknown> | null;
  get game(): Record<string, unknown> | null;
  latestState(forPlayer?: string | null): Record<string, unknown> | null;
  activePrompt(forPlayer: string): Record<string, unknown> | null;
  on(eventName: RelayClientEvent, listener: (value: any) => void): () => void;
  connect(): void;
  close(code?: number, reason?: string): void;
  send(message: Record<string, unknown>): void;
  listRooms(): void;
  joinRoom(options: { roomId: string; password?: string; observe?: boolean; asBot?: boolean }): void;
  setDeckSelection(options: {
    deckName: string;
    deck: Record<string, unknown>;
    publishedDeckId?: string | null;
    commanderName?: string | null;
    avatarUrl?: string | null;
  }): void;
  setReady(ready?: boolean): void;
  spawnBots(options: {
    roomId: string;
    decks: Array<Record<string, unknown>>;
    fromPlayer?: string;
  }): void;
  broadcastRoomPayload(options: {
    roomId: string;
    payload: Record<string, unknown>;
    fromPlayer?: string;
  }): void;
  startGame(format?: string): void;
  requestResync(): void;
  respond(options: {
    fromPlayer: string;
    promptId: number;
    actionType: string;
    output: Record<string, unknown>;
  }): void;
}
