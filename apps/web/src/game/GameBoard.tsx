import { useState } from "react";
import type { NormalizedGameView } from "@mtg-commander/shared";
import { loadFixtureGameView } from "./fixture.js";
import { opponentsOf } from "./view-model.js";
import { TurnBar } from "./TurnBar.js";
import { OpponentPanel } from "./OpponentPanel.js";
import { OwnBoard } from "./OwnBoard.js";
import { SidePanel } from "./SidePanel.js";
import { StateLoader } from "./StateLoader.js";

export function GameBoard() {
  const [view, setView] = useState<NormalizedGameView>(() => loadFixtureGameView());
  const [source, setSource] = useState("Fixture: Vier-Spieler-Startzustand");

  return (
    <section className="board" aria-label="Commander-Spielbrett">
      <TurnBar view={view} />
      <div className="board-layout">
        <div className="opponents">
          {opponentsOf(view).map((player) => (
            <OpponentPanel key={player.id} player={player} view={view} />
          ))}
        </div>
        <OwnBoard view={view} />
        <SidePanel view={view} />
      </div>
      <StateLoader
        source={source}
        onLoaded={(next, label) => {
          setView(next);
          setSource(label);
        }}
      />
    </section>
  );
}