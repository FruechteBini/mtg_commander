# UI-Modell: normalisierte `gameView`-Projektion (UI-001)

Die Engine bleibt autoritativ. Dieses Modell ist eine reine, deterministische Leseprojektion echter
Manabrew-`gameView`-States, damit die React-Oberflaeche keine Manabrew-Feldnamen kennen muss.

- Implementierung: `packages/shared/src/game-view.ts`
- Vier-Spieler-Fixture: `packages/shared/fixtures/game-view-four-player.json`
- Regressionstest: `npm run gameview:test` (`scripts/game-view-normalizer-test.mjs`)

## Grundregeln

- **Versioniert:** `UI_MODEL_VERSION` ist `1`. Jedes normalisierte Modell traegt sie in
  `modelVersion`; Consumer koennen daran ableiten, ob sie die Form verstehen.
- **Deterministisch:** Gleicher Engine-State erzeugt immer dasselbe JSON. Maps (Marker,
  Commander-Wirkungen, Commander-Schaden, Mana-`other`) werden zu sortierten Arrays/Objekten,
  Zonen haben eine feste Reihenfolge und Farben sind sortiert. Die Schluesselreihenfolge des
  Engine-JSON hat keinen Einfluss.
- **Total und defensiv:** Fehlende oder zusaetzliche Engine-Felder werfen nie. Unbekannte Werte
  degradieren auf explizite Fallbacks (`phase: "unknown"`, `kind: "unknown"`,
  `visibility: "unknown"`, Mana in `other`).

## `NormalizedGameView`

| Feld | Bedeutung |
| --- | --- |
| `modelVersion` | Immer `UI_MODEL_VERSION` (aktuell `1`). |
| `gameId`, `forPlayerId` | Spiel und Perspektive, fuer die die Engine projiziert hat (`null` wenn absent). |
| `playerCount`, `players` | `UiPlayerSeat[]` in Engine-Sitzreihenfolge. |
| `playerZones` | Zonen pro Spieler gruppiert; pro Gruppe feste Zonenreihenfolge. |
| `sharedZones` | Zonen ohne bekannten Besitzer; mit der aktuellen Engine leer. |
| `stack` | `UiStackEntry[]` mit `id`, `name`, `controllerId`, `targets`. |
| `turn` | `UiTurnInfo`: `turn` (nullbasiert, wie beobachtet), `displayTurn` (`turn + 1`), `step` (roh), `phase`. |
| `combat` | `combatPhaseActive` (Phase `combat`) und rohe `assignments` (bisher nur leere Arrays beobachtet, unangetastet weitergereicht). |
| `specialRoles` | `monarchId`, `initiativeHolderId`, `dayTime`, `activePlaneNames` (`null` wird `[]`). |
| `activePlayerId`, `priorityPlayerId` | Aktiver Spieler und Prioritaetstraeger (`null` wenn absent). |
| `gameOver`, `winnerId` | Spielende und Gewinner. |

### Spieler (`UiPlayerSeat`)

`id`, `name`, `seat`, `life`, `status`, `isHuman`, `isActive`, `hasPriority`, `isMonarch`,
`hasInitiative`, `hasCityBlessing`, `isExtraTurn`, `manaPool`, `maxHandSize`,
`cardsDrawnThisTurn`, `landsPlayedThisTurn`, `maxLandPlaysPerTurn`, `unlimitedLandPlays`,
`commanderCasts` (nach `cardId` sortiert), `commanderDamage` (nach Angreifer sortiert; bisher
leer beobachtet), `playerKeywords`, `counters` (sortierte Map).

`manaPool` (`UiManaPool`) mappt die beobachteten Symbole `W/U/B/R/G/C` auf
`white/blue/black/red/green/colorless`; unbekannte Symbole landen sortiert in `other`.

### Zonen (`UiZone`)

Feste Reihenfolge pro Spieler: `battlefield`, `hand`, `library`, `graveyard`, `exile`, `command`.
Unbekannte Rohzonen (z. B. `sideboard`) erhalten `kind: "unknown"` mit erhaltenem `rawName` und
sortieren hinten, untereinander alphabetisch.

Verdeckte Zonen werden nicht erfunden: `knownCount` zaehlt die fuer diesen Betrachter
sichtbaren Karteneintraege, `reportedCount` die Engine-Meldung; `hidden` ist wahr, sobald die
Engine mindestens eine Karte vorenthaelt (`knownCount < reportedCount`). Eine typische
Bibliothek ist damit `hidden: true` mit `reportedCount: 99` und leeren `cards`.

### Karten (`UiCard`)

`id`, `name`, `visibility` (`visible`/`hidden`/`redacted`/`unknown`), `ownerId`,
`controllerId`, `tapped`, `creature` (`power`/`toughness` als Strings, weil Forge `*` meldet,
plus `damage`), `manaCost`, `cmc`, `colors` (aus der `color`-Zeichenkette, z. B. `"BR"` ->
`["B","R"]`, sortiert), `types`, `subtypes`, `supertypes`, `keywords`, `counters`,
`summoningSick`, `faceDown`, `transformed`, `phasedOut`, `exerted`, `commanderTax`, `isToken`,
`setCode`, `cardNumber`.

## API

- `normalizeGameView(dto, options?)` projiziert einen validierten `GameViewDto`. Wirft nur fuer
  Nicht-Objekte; alle optionalen Felder degradieren auf Fallbacks.
- `normalizeStateEnvelope(envelope)` akzeptiert ausschliesslich State-Envelopes
  (`kind: "state"`) und uebernimmt deren Perspektive als `forPlayerId`.

## Regressionstest

`npm run gameview:test` prueft:

1. Das Vier-Spieler-Fixture: 4 Spieler, je 6 Zonen in fester Reihenfolge, Neheb the Worthy im
   Command-Zone, verdeckte Bibliotheken (`reportedCount: 99`, keine Karten), `step: "untap"`,
   `displayTurn: 1`.
2. Determinismus: Schluesselumordnung des Fixtures erzeugt ein deep-gleiches Modell.
3. Shock-Vorher/Nachher aus dem realen Capture: Leben 40 -> 38, Karte wandert `hand` ->
   `graveyard`, Stack-Eintrag mit Spieler- und Kartenziel.
4. Defensive Faelle: unbekannter Step (`cleanupX` -> `phase: "unknown"`), `sideboard` als
   `unknown`-Zone hinten, Shrapnel Beast (`visibility: "unknown"`, Farben `["B","R"]`,
   `power: "*"`), `assert.throws` fuer Prompt-Envelopes und `null`-Input.
5. Optional alle eingehenden `StateUpdate`s aus lokalen `captures/*.jsonl` (derzeit 2 States).

## Bekannte Grenzen

- `combatAssignments` ist bisher nur als leeres Array beobachtet und wird unveraendert
  durchgereicht; die Struktur wird mit `UI-002` bzw. Combat-Captures festgezurrt.
- `stateDelta`-Envelopes wurden im erfolgreichen Capture nicht emittiert; das Modell bildet
  bewusst nur Vollzustaende ab.
- `sharedZones` ist mit der aktuellen Engine immer leer und bleibt als Absicherung fuer
  zukuenftige Engine-Versionen erhalten.
