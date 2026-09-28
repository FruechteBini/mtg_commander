import { useMemo, useState } from "react";
import { normalizeGameView, type NormalizedGameView } from "@mtg-commander/shared";
import { loadFixtureGameView } from "./fixture.js";
import { highlightCardIds } from "./prompt-options.js";
import type { LiveGamePanel } from "./useLiveGame.js";
import { opponentsOf } from "./view-model.js";
import { TurnBar } from "./TurnBar.js";
import { OpponentPanel } from "./OpponentPanel.js";
import { OwnBoard } from "./OwnBoard.js";
import { SidePanel } from "./SidePanel.js";
import { StateLoader } from "./StateLoader.js";

export function GameBoard({ live = null }: { live?: LiveGamePanel | null }) {
  const [override, setOverride] = useState<{ view: NormalizedGameView; label: string } | null>(null);

  const liveView = useMemo<NormalizedGameView | null>(() => {
    const gameView = live?.snapshot.gameView;
    if (!gameView) return null;
    try {
      return normalizeGameView(gameView);
    } catch {
      return null;
    }
  }, [live?.snapshot.gameView]);

  const view = override?.view ?? liveView ?? loadFixtureGameView();
  const source =
    override?.label ??
    (liveView ? `Live-Spiel \u00b7 gameId ${liveView.gameId}` : "Fixture: Vier-Spieler-Startzustand");
  const highlighted = live?.snapshot.prompt ? highlightCardIds(live.snapshot.prompt) : null;

  return (
    <section className="board" aria-label="Commander-Spielbrett">
      <TurnBar view={view} />
      <div className="board-layout">
        <div className="opponents">
          {opponentsOf(view).map((player) => (
            <OpponentPanel key={player.id} player={player} view={view} />
          ))}
        </div>
        <OwnBoard view={view} highlightCardIds={highlighted} />
        <SidePanel view={view} live={live} />
      </div>
      <StateLoader
        source={source}
        onLoaded={(next, label) => {
          setOverride({ view: next, label });
        }}
        onReset={override && liveView ? () => setOverride(null) : null}
      />
    </section>
  );
}
