/**
 * Manabrew protocol contract observed against protocol_version 5.
 * Runtime validation lives in manabrew-protocol-parser.mjs.
 */

export type PlayerId = `player-${number}` | string;
export type CardId = string;
export type ActionId = string;
export type Fingerprint = string;
export type JsonObject = Record<string, unknown>;

export interface AuthResultMessage {
  type: "AuthResult";
  success: boolean;
  player_id?: string | null;
  reconnected?: boolean;
  error?: string | null;
  features?: string[];
}

export interface RoomPlayerDto {
  username: string;
  ready: boolean;
  connected: boolean;
  is_bot: boolean;
  selected_deck_name?: string;
}

export interface RoomDto {
  room_id: string;
  room_name: string;
  host: string;
  protocol_version: number;
  players: RoomPlayerDto[];
  max_players: number;
  format: string;
  status: string;
  engine: string;
  hosted?: boolean;
  official?: boolean;
  password_protected?: boolean;
  reconnect_timeout_s?: number;
}

export interface RoomListMessage { type: "RoomList"; rooms: RoomDto[] }
export interface RoomUpdateMessage { type: "RoomUpdate"; room: RoomDto }

export interface GameStartedMessage {
  type: "GameStarted";
  room_id: string;
  game_id: string;
  player_order: string[];
  player_decks?: unknown[];
  starting_life?: number;
}

export interface RelayErrorMessage {
  type: "Error";
  code?: string;
  message: string;
  [key: string]: unknown;
}

/** The relay also forwards self-hosted-node roomRelay broadcasts as StateUpdate (BOT-002 long-run). */
export interface StateUpdateMessage { type: "StateUpdate"; state: EngineToClientEnvelope | RoomRelayEnvelope }
export interface BroadcastStateMessage {
  type: "BroadcastState";
  state: ClientToEngineEnvelope | RoomRelayEnvelope;
  target_player: PlayerId | null;
}

export type RelayInboundMessage =
  | AuthResultMessage
  | RoomListMessage
  | RoomUpdateMessage
  | GameStartedMessage
  | StateUpdateMessage
  | RelayErrorMessage
  | ({ type: string } & JsonObject);

export interface CardIdentity {
  name: string;
  setCode?: string;
  cardNumber?: string;
  isToken?: boolean;
}

export interface CardViewDto {
  id?: CardId;
  identity?: CardIdentity;
  visibility?: "visible" | "hidden" | "redacted" | string;
  ownerId?: PlayerId;
  controllerId?: PlayerId;
  tapped?: boolean;
  power?: string | null;
  toughness?: string | null;
  text?: string;
  [key: string]: unknown;
}

export interface ZoneDto {
  zone: string;
  ownerId: PlayerId;
  count: number;
  /** Hidden zones can have count > 0 while cards is empty. */
  cards: CardViewDto[];
}

export interface PlayerDto {
  id: PlayerId;
  name: string;
  life: number;
  status?: string;
  isHuman?: boolean;
  manaPool?: Record<string, number>;
  [key: string]: unknown;
}

export interface StackObjectDto {
  id?: string;
  source?: CardViewDto;
  controllerId?: PlayerId;
  targets?: TargetRef[];
  [key: string]: unknown;
}

export interface GameViewDto {
  gameId: string;
  players: PlayerDto[];
  zones: ZoneDto[];
  stack: StackObjectDto[];
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  step: string;
  /** The real protocol uses turn, not turnNumber. */
  turn: number;
  gameOver: boolean;
  winnerId?: PlayerId | null;
  [key: string]: unknown;
}

export interface StateEnvelope {
  kind: "state";
  forPlayer?: PlayerId;
  /** Observed missing on some live broadcast states (BOT-002 long-run). */
  fingerprint?: Fingerprint;
  emitMs?: number;
  engineMs?: number;
  state: { gameView: GameViewDto; [key: string]: unknown };
}

/** Inventoried from the protocol contract; not emitted by the successful Shock capture. */
export interface StateDeltaEnvelope {
  kind: "stateDelta";
  forPlayer?: PlayerId;
  base: Fingerprint;
  fingerprint: Fingerprint;
  patch: unknown;
  emitMs?: number;
  engineMs?: number;
}

export interface PromptEnvelope {
  kind: "prompt";
  forPlayer: PlayerId;
  prompt: AgentPrompt;
  emitMs?: number;
  engineMs?: number;
}

export interface EngineErrorEnvelope {
  kind: "error" | "fatal";
  code?: string;
  message: string;
  promptId?: number;
  [key: string]: unknown;
}

export type EngineToClientEnvelope = StateEnvelope | StateDeltaEnvelope | PromptEnvelope | EngineErrorEnvelope;

export interface AgentPrompt {
  promptId: number;
  decidingPlayerId: PlayerId;
  sourceCard?: CardViewDto;
  sourceAbilityText?: string;
  input: PromptInput;
}

export type PromptInput =
  | ChooseActionInput
  | ChooseBoardTargetsInput
  | PayManaCostInput
  | DiceRolledInput
  | MulliganInput
  | ({ type: string } & JsonObject);

export interface ChooseActionInput { type: "chooseAction"; actions: AvailableAction[] }

export interface TargetRef {
  id: string;
  kind: "player" | "card" | string;
}

export interface ChooseBoardTargetsInput {
  type: "chooseBoardTargets";
  candidates: TargetRef[];
  minTargets: number;
  maxTargets: number;
  chosenTargets: number;
  cancellable: boolean;
  hostile?: boolean;
  intent?: string;
  presentation?: JsonObject;
}

export interface PayManaCostInput {
  type: "payManaCost";
  actions: AvailableAction[];
  canConfirmFromPool: boolean;
  cardId: CardId;
  cardName: string;
  manaCost: string;
  presentation?: JsonObject;
}

export interface DiceRolledInput { type: "diceRolled"; [key: string]: unknown }
export interface MulliganInput { type: "mulligan"; [key: string]: unknown }

export interface AvailableAction {
  id: ActionId;
  type: string;
  cardId?: CardId;
  label?: string;
  mode?: JsonObject;
  abilityIndex?: number;
  description?: string;
  isManaAbility?: boolean;
  producedMana?: Array<{ color: string; amount: number }>;
  [key: string]: unknown;
}

export type ChooseActionOutput =
  | { type: "pass"; exhaustStack: boolean }
  | { type: "restoreSnapshot"; checkpointId: number }
  | { type: "act"; actionId: ActionId };
export type ChooseBoardTargetsOutput = { type: "boardTargets"; chosen: TargetRef[] } | { type: "cancel" };
export type PayManaCostOutput =
  | { type: "act"; actionId: ActionId }
  | { type: "pay"; auto: boolean }
  | { type: "cancel" };
export type PromptOutput =
  | ChooseActionOutput
  | ChooseBoardTargetsOutput
  | PayManaCostOutput
  | { type: "diceRolledAcknowledged" }
  | { type: "mulliganDecision"; keep: boolean }
  | ({ type: string } & JsonObject);

export interface PromptAction<TOutput extends PromptOutput = PromptOutput> {
  type: string;
  output: TOutput;
}

export interface ClientToEngineEnvelope {
  kind: "response";
  fromPlayer: PlayerId;
  promptId: number;
  action: PromptAction;
}

export interface RoomRelayEnvelope {
  kind: "roomRelay";
  protocol: string;
  version: number;
  messageId: string;
  fromPlayer: string;
  roomId: string;
  payload: JsonObject;
}

