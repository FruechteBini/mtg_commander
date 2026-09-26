import fixtureJson from "../../../../packages/shared/fixtures/game-view-four-player.json";
import { normalizeStateEnvelope } from "@mtg-commander/shared";
import type { NormalizedGameView, StateEnvelope } from "@mtg-commander/shared";

/**
 * Deterministic offline board state for the UI-002 slice: the committed
 * four-player fixture from UI-001, projected through the shared normalizer.
 */
export function loadFixtureGameView(): NormalizedGameView {
  const fixture = fixtureJson as { messages?: Array<Record<string, unknown>> };
  const message = (fixture.messages ?? []).find((entry) => entry.type === "StateUpdate");
  if (!message) {
    throw new Error("Fixture enthaelt keine StateUpdate-Nachricht.");
  }
  return normalizeStateEnvelope(message.state as unknown as StateEnvelope);
}