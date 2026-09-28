# MTG-Commander

Privater Prototyp fuer eine Commander-App fuer unsere Playgroup.

## Ziel

Wir wollen eine spielbare Commander-Erfahrung fuer eine private Playgroup von ca. 15 Leuten bauen. Der erste Meilenstein ist ein Desktop-PC-orientierter Prototyp, in dem ein Mensch gegen drei Bots mit echten Commander-Decks aus der Gruppe spielen kann.

Die App soll eine vorhandene Regel-Engine nutzen, zuerst wahrscheinlich Forge/Manabrew-basiert. Der wichtigste technische Proof of Concept ist: eine eigene UI spricht sinnvoll mit dem Manabrew-Protokoll, statt sofort Manabrew komplett zu forken.

## MVP-Richtung

- Privater Prototyp, kein oeffentliches Produkt.
- Desktop-Browser zuerst, Tauri-Desktop-App optional spaeter.
- Kein Mobile im ersten Meilenstein.
- React/TypeScript fuer die Web-App.
- Node/TypeScript API mit SQLite fuer Saves, Deckbibliothek, GLM-Zugriff und Bot-Orchestrierung.
- Docker Compose als erstes Deployment-Ziel auf einer Synology NAS mit 6 GB RAM.
- Zugriff per privatem Invite-/Playgroup-Code statt Accountsystem.

## Erster Erfolgsmoment

Eine Person startet lokal oder auf dem privaten Server eine Commander-Partie gegen drei einfache Bots. Die Partie nutzt echte importierte Commander-Decklisten, zeigt eine Hybrid-Commander-UI, erlaubt einige legale Aktionen, kann gespeichert und wieder geladen werden und kann auf Nachfrage ein Spielereignis per GLM erklaeren.

## Dokumentation

Der zentrale Einstiegspunkt fuer Status, Historie und alle Pflicht- sowie Optional-Tickets ist:
[docs/project-tickets.md](docs/project-tickets.md).

Diese Datei ist das laufende Projektboard. Nach einem Clone auf einem anderen Rechner zuerst dort den Abschnitt **Weiterarbeiten auf einem neuen Rechner** lesen und danach das oberste Ticket mit Status `NEXT` bearbeiten. Bei jeder Aenderung werden Ticketstatus, Evidence, Ergebnis, naechster Schritt und Risiken direkt im Projektboard aktualisiert.

Die Dokumentation ist so aufgeteilt:

- [docs/project-tickets.md](docs/project-tickets.md): zentrale Ticketliste, aktueller Stand, Historie, Risiken und Reihenfolge.
- [docs/architecture.md](docs/architecture.md): beschlossene Prozess-, Netzwerk-, Secret-, Reconnect- und Lizenzgrenzen.
- [docs/wayfinding.md](docs/wayfinding.md): Produktentscheidungen und Forschungsfragen.
- [docs/save-resume-research.md](docs/save-resume-research.md): SAVE-001-Ergebnis - Engine-Save/Restore-No-Go im Upstream-Node und Alternativarchitektur (Replay-Journal vs. Fork).
- [docs/protocol-poc.md](docs/protocol-poc.md): Protocol-Grenze, Nachrichtenformen und Capture-Ergebnisse.
- [docs/real-engine-poc.md](docs/real-engine-poc.md): lokales Docker-/Forge-Runbook.

Repository-Status: Die Git-Baseline ist hergestellt. Branch `main` verfolgt `origin/main` unter `https://github.com/FruechteBini/mtg_commander.git`; `BOOT-001` ist abgeschlossen und der dokumentierte Stand kann auf einem anderen Rechner geklont werden.

## Web-/API-Grundgeruest starten

Voraussetzung: Node.js 22.12 oder neuer und npm 10 oder neuer.

```powershell
npm install
npm run dev
```

Danach sind erreichbar:

- Web-App: `http://127.0.0.1:5173`
- Web-Healthcheck: `http://127.0.0.1:5173/healthz`
- API: `http://127.0.0.1:8787`
- API-Liveness: `http://127.0.0.1:8787/healthz`
- API-Readiness: `http://127.0.0.1:8787/readyz`

Die Web-App ruft die API lokal ueber den Vite-Proxy unter `/api` auf. Relay-, Raum- und GLM-Secrets gehoeren ausschliesslich in die serverseitige Konfiguration; eine Vorlage liegt unter `apps/api/.env.example`.

Pruefen und fuer Produktion bauen:

```powershell
npm run typecheck
npm test
npm run build
```

Workspace-Struktur:

- `apps/web`: React-/Vite-Oberflaeche.
- `apps/api`: Node-/TypeScript-API.
- `packages/manabrew-client`: wiederverwendbarer serverseitiger Relay-/Game-Client.
- `packages/shared`: gemeinsame Domain- und Manabrew-Protokolltypen sowie den neutralen Commander-Decklistenimport (`deck-list.ts`, Test via `npm run deck:test`).
- `decks`: echte Playgroup-Decklisten als Text plus importierte Deck-Modelle (JSON); Beweisskript fuer den Forge-Start: `node scripts/deck-forge-start.mjs`.

Der erste lokale Protokoll-PoC liegt in [docs/protocol-poc.md](docs/protocol-poc.md). Er kann ohne Dependencies direkt mit Node ausgefuehrt werden:

```sh
node scripts/protocol-poc.mjs
```

Der reale Protocol-v5-Vertrag und der sanitiserte Shock-Regressionsloop werden ebenfalls ohne Dependencies geprueft:

```sh
node scripts/protocol-contract-test.mjs
```

Der Test validiert Relay- und Engine-Envelopes, State, Ziel-/Mana-Prompts, die erzeugten Antworten und den abschliessenden Zustandswechsel. Liegt der ignorierte lokale Raw-Capture vor, werden auch alle seine Nachrichten gestreamt und validiert. Derselbe Lauf steht als `npm run protocol:test` bereit.

Das stabile UI-Modell fuer echte `gameView`-States hat einen eigenen Regressionstest:

```sh
npm run gameview:test
```

Er normalisiert das Vier-Spieler-Fixture und den Shock-Zustandswechsel deterministisch, prueft defensive Fallbacks gegen unvollstaendige Engine-Daten und streamt vorhandene lokale Raw-Captures durch das Modell. Das Modell ist in [docs/ui-model.md](docs/ui-model.md) dokumentiert.

Die Web-App rendert dieses Modell bereits: Unter `npm run dev` zeigt `http://127.0.0.1:5173` das statische Hybrid-Commander-Brett mit grossem eigenen Bereich, drei aufklappbaren Gegner-Panels, Stack-Ansicht und einem Capture-Loader, der echte `StateUpdate`-Nachrichten aus `captures/*.jsonl` statisch rendert.

Mit aktiver Live-Sitz (`UI-003`, Inkrement 1) rendert dasselbe Brett den echten Engine-Zustand und offene Prompts sind klickbar: legale Aktionen werden als Buttons angeboten (inklusive Passen/Abbrechen), Auswahlprompts (Ziele/Karten) validieren min/max, betroffene Karten werden im Brett hervorgehoben und Engine-Fehler erscheinen sichtbar im Prompt-Panel. Die Web-App pollt dazu `GET /api/game` und sendet Antworten an `POST /api/game/respond`. Die eigenen Handkarten werden als echte Kartenbilder live ueber die Scryfall-API geladen (GET `api.scryfall.com/cards/{set}/{nummer}` mit Namens-Fallback ueber `/cards/named`, Modul-Cache, Rate-Limit-konform sequenziell; ohne Netz dient eine Text-Kachel als Fallback).

Der echte Engine-Schritt ist als Docker-Runbook vorbereitet und lokal mit Docker Desktop/WSL2 erfolgreich gestartet:
[docs/real-engine-poc.md](docs/real-engine-poc.md).

Lokaler Start:

```powershell
cd infra/manabrew-forge-room
& 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' compose up -d
```

Pruefen:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:9444/health | Select-Object -ExpandProperty Content
```

Echten Protokoll-Capture gegen die laufende lokale Engine starten:

```powershell
node scripts\capture-real-session.mjs
```

Der aktuelle Real-Capture bestaetigt einen mehrstufigen MVP-Aktionsloop: Ein eigener Node-Client startet eine Vier-Spieler-Forge-Partie, spielt ein Mountain, wirkt `Shock`, waehlt einen Gegner, aktiviert die Manafaehigkeit, bestaetigt die Zahlung, passt Prioritaet und prueft die Aufloesung. Im Proof wechselte `Shock` von der Hand in den Friedhof, der Stack war danach leer und das Ziel verlor zwei Leben.

Die wiederverwendbare Client-Bibliothek ist unter [docs/engine-client.md](docs/engine-client.md) beschrieben. Gegen einen laufenden lokalen Relay kann ihre Authentifizierung und Raumliste separat geprueft werden:

```powershell
npm run engine:smoke
```

Vier-Spieler-Langlauf gegen den laufenden Stack (Mensch-/Capture-Client + 3 Bots, echtes Playgroup-Deck, Zielzugzahl, Stall-Watchdog, Grace-Phase und Docker-Speichersampling):

```powershell
npm run bot:longrun
```

Der aktuelle Bot-Langlauf (`BOT-002`) bestaetigt eine komplette Partie ueber 66 Turns bis zum natuerlichen GameOver: 758 Prompt-Antworten ohne Deadlock oder Engine-Fehler, Land-Policy inklusive, und ein linear stabiler forge-room-Speicher (246,9 -> 340,5 MiB).

Zusaetzlich schreibt die API automatisch ein Replay-Journal (`SAVE-002`, Option "B light"): Startbedingung und jede Prompt-Antwort jeder Partie werden geordnet und versioniert als JSONL mitgeschrieben - heute fuer Audit/Debugging, spaeter als Basis fuer Replay-Restore, sobald Upstream den Spiel-Seed veroeffentlicht (Issue-Entwurf: `docs/upstream-seed-issue.md`). Konfiguration: `MANABREW_JOURNAL_DIR` (Standard `captures/`), `MANABREW_JOURNAL_DISABLE=1` schaltet es ab (Details: `docs/save-resume-research.md`).

Live-Sitz fuer die Browser-Interaktion (`UI-003`): Die API haelt genau eine interaktive Mensch-Sitz gegen den Relay und fuehrt den bewaehrten BOT-002-Flow aus (Raum finden, beitreten, Deck waehlen, Bots spawnen, ready, Spiel starten). Aktivierung per `MANABREW_ROOM_NAME` (zusaetzlich zu `MANABREW_RELAY_URL`/`MANABREW_SERVER_KEY`); Optionen: `MANABREW_ROOM_PASSWORD` (Standard `local-dev`), `MANABREW_DECK_FILE` (Standard `decks/dina-sacrifice.txt`; `MANABREW_DECK_DISABLE=1` = nur zuschauen), `MANABREW_DECK_NAME`/`MANABREW_DECK_OWNER`/`MANABREW_DECK_COMMANDER`, `MANABREW_SPAWN_BOTS=0` und `MANABREW_BOT_COUNT` (1-3, Standard 3). Engine bleibt Regeln-Autoritaet: Die Session leitet nur Prompts des eigenen Sitzes weiter (`apps/api/src/engine-session.ts`).
