export type PlayerId = string;
export type CardId = string;
export type ActionId = string;

export type StepKind =
  | "beginning"
  | "precombatMain"
  | "combat"
  | "postcombatMain"
  | "ending"
  | string;

export interface CardIdentity {
  name: string;
  setCode?: string;
  cardNumber?: string;
  token?: boolean;
}

export interface CardDto {
  id: CardId;
  identity: CardIdentity;
  tapped?: boolean;
  power?: string;
  toughness?: string;
  text?: string;
}

export interface CardView {
  visibility: "visible" | "hidden" | "redacted";
  id?: CardId;
  card?: CardDto;
}

export interface ZoneDto {
  zone: string;
  ownerId: PlayerId;
  count: number;
  cards: CardView[];
}

export interface PlayerDto {
  id: PlayerId;
  name: string;
  life: number;
  manaPool?: Record<string, number>;
}

export interface StackObjectDto {
  id: string;
  source?: CardDto;
  controllerId?: PlayerId;
  targets?: unknown[];
}

export interface GameViewDto {
  players: PlayerDto[];
  zones: ZoneDto[];
  stack: StackObjectDto[];
  activePlayerId: PlayerId;
  priorityPlayerId?: PlayerId;
  step: StepKind;
  turnNumber?: number;
}

export type EngineToClientMessage =
  | { kind: "state"; gameView: GameViewDto; fingerprint?: string }
  | { kind: "stateDelta"; base: string; fingerprint: string; patch: unknown }
  | { kind: "prompt"; prompt: AgentPrompt }
  | { kind: "error"; code: ProtocolErrorCode; message: string; promptId?: number };

export type ProtocolErrorCode =
  | "stalePrompt"
  | "wrongPlayer"
  | "wrongPromptType"
  | "unknownActionId"
  | "invalidShape";

export interface AgentPrompt {
  promptId: number;
  decidingPlayerId: PlayerId;
  sourceCard?: CardDto;
  input: PromptInput;
}

export type PromptInput =
  | ChooseActionInput
  | { type: string; [key: string]: unknown };

export interface ChooseActionInput {
  type: "chooseAction";
  actions: AvailableAction[];
}

export type AvailableAction =
  | CastAction
  | ActivateAbilityAction
  | GenericAvailableAction;

export interface CastAction {
  id: ActionId;
  type: "cast";
  cardId: CardId;
  mode?: string;
  modeLabel?: string;
}

export interface ActivateAbilityAction {
  id: ActionId;
  type: "activateAbility";
  cardId: CardId;
  abilityIndex: number;
  description?: string;
  isManaAbility?: boolean;
  producedMana?: Array<{ color: string; amount: number }>;
}

export interface GenericAvailableAction {
  id: ActionId;
  type: string;
  cardId?: CardId;
  [key: string]: unknown;
}

export type ClientToEngineMessage =
  | { kind: "response"; promptId: number; action: PromptOutput }
  | { kind: "directive"; directive: DirectiveInput };

export type PromptOutput =
  | {
      type: "chooseAction";
      output: ChooseActionOutput;
    }
  | { type: string; output?: unknown };

export type ChooseActionOutput =
  | { type: "pass"; until?: PassUntil; exhaustStack: boolean }
  | { type: "restoreSnapshot"; checkpointId: number }
  | { type: "act"; actionId: ActionId };

export interface PassUntil {
  playerId: PlayerId;
  phase: StepKind;
}

export type DirectiveInput = { type: "concede" };

export function actionResponse(promptId: number, actionId: ActionId): ClientToEngineMessage {
  return {
    kind: "response",
    promptId,
    action: {
      type: "chooseAction",
      output: { type: "act", actionId },
    },
  };
}

export function passResponse(promptId: number, exhaustStack = false): ClientToEngineMessage {
  return {
    kind: "response",
    promptId,
    action: {
      type: "chooseAction",
      output: { type: "pass", exhaustStack },
    },
  };
}
