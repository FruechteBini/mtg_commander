# Projektboard: MTG-Commander

Diese Datei ist der zentrale Einstiegspunkt fuer die weitere Arbeit. Sie dokumentiert den aktuellen Projektstand, die bisher erledigte Arbeit sowie alle bekannten Pflicht-, Risiko- und Optional-Tickets.

Wer das Repository auf einem anderen Rechner klont, sollte zuerst den Abschnitt [Weiterarbeiten auf einem neuen Rechner](#weiterarbeiten-auf-einem-neuen-rechner) lesen und danach das oberste offene Ticket bearbeiten.

## Arbeitsregeln

- Dieses Dokument ist die zentrale Ticket- und Fortschrittsliste.
- `docs/wayfinding.md` enthaelt die Produktentscheidungen und Forschungsfragen hinter den Tickets.
- `docs/protocol-poc.md` und `docs/real-engine-poc.md` enthalten technische Protokoll- und Engine-Details.
- Bei jeder Arbeit werden Status, Evidence, Ergebnis, naechster Schritt und neue Risiken direkt hier aktualisiert.
- Ein Ticket ist erst `DONE`, wenn seine Akzeptanzkriterien nachweislich erfuellt sind.
- Neue Capture-Rohdaten (`captures/*.jsonl`) bleiben lokal und werden nicht committed. Kleine Summary-Dateien duerfen als Evidence versioniert werden.
- Secrets gehoeren nur in lokale `.env`-Dateien. `.env` und rohe Captures sind ueber `.gitignore` ausgeschlossen.

### Statuswerte

| Status | Bedeutung |
| --- | --- |
| `NEXT` | Der empfohlene unmittelbare naechste Arbeitsschritt. |
| `READY` | Klar beschrieben und ohne bekannten Blocker startbar. |
| `IN PROGRESS` | Wird aktuell bearbeitet. |
| `BLOCKED` | Kann erst nach einer dokumentierten Abhaengigkeit weitergehen. |
| `RESEARCH` | Entscheidung oder technischer Proof fehlt noch. |
| `OPTIONAL` | Nicht fuer Milestone 1 erforderlich. |
| `DEFERRED` | Bewusst auf spaeter verschoben. |
| `DONE` | Akzeptanzkriterien sind mit Evidence erfuellt. |

## Aktueller Checkpoint

Stand: 26. September 2026

### Was bereits funktioniert

- Lokaler Manabrew-Relay und Forge-backed self-hosted node laufen per Docker Compose.
- Ein eigener dependency-freier Node-Client authentifiziert sich am Relay und tritt dem Raum bei.
- Der Client setzt ein Commander-Deck, markiert sich als bereit und startet ein Spiel.
- Ein einzelner self-hosted node startet drei Bot-Tasks ueber einen gemeinsamen `spawnBot`-Request mit `decks`.
- Eine echte Vier-Spieler-Partie mit einem Menschen und drei Bots wurde gestartet.
- Echte `gameView`-States sowie `diceRolled`, `mulligan` und `chooseAction`-Prompts wurden empfangen.
- Leere Aktionsraeume werden legal mit `pass` beantwortet.
- Eine Engine-gelieferte Aktion wurde per `act` ausgefuehrt: `Play Mountain` verschob die gewaehlte Karte in derselben Spielerperspektive von `hand` nach `battlefield`.
- Ein mehrstufiger Nichtland-Zauber wurde Ende-zu-Ende ausgefuehrt: `Cast Shock` -> gegnerisches `TargetRef` -> Mountain-Manafaehigkeit -> Mana bestaetigen -> Prioritaet passen -> Aufloesung. Der Zauber wechselte von `hand` zu `graveyard`, der Stack war danach leer und das Ziel verlor zwei Leben.
- Reale Relay- und Engine-Nachrichten sind als getrennte TypeScript-Vertraege modelliert. Ein dependency-freier Runtime-Parser validiert das sanitisiert gespeicherte Shock-Fixture sowie alle 228 Nachrichten des lokalen erfolgreichen Raw-Captures.
- Capture-Logs redigieren das Relay-Passwort.
- Lokale Secrets, rohe Captures und temporaere Source-Checkouts sind von Git ausgeschlossen.
- Der Projektstand ist auf Branch `main` im GitHub-Remote `origin` versioniert und von einem zweiten Rechner klonbar.
- `ARCH-001` ist abgeschlossen: Browser, eigene API, Relay und Forge-node haben dokumentierte Prozess-, Secret-, Reconnect-, Deployment- und Lizenzgrenzen.
- `APP-001` ist abgeschlossen: npm-Workspace, React-/Vite-Web-App, Node-/TypeScript-API und Shared-Package starten und bauen gemeinsam; getrennte Healthchecks sind erreichbar.
- `ENGINE-001` ist abgeschlossen: API und Capture-Skript verwenden denselben getesteten Manabrew-Client fuer Auth, Raum-, Spiel-, Prompt- und Reconnect-Ablauf.
- `UI-001` ist abgeschlossen: Echte `gameView`-States werden deterministisch in das versionierte UI-Modell (`UI_MODEL_VERSION 1`) normalisiert; ein Vier-Spieler-Fixture und alle lokalen Raw-Capture-States laufen durch den Regressionstest.
- `UI-002` ist abgeschlossen: Die Web-App rendert das UI-Modell als ersten statischen Hybrid-Commander-Board-Slice - grosser eigener Bereich, drei kompakte aufklappbare Gegner-Panels, Stack sichtbar, Capture-Loader zum statischen Rendern echter States.
- `DECK-001` ist abgeschlossen: Typische Commander-Textlisten (Sektionen wie `Deck`/`Commander`/`Sideboard`, `*CMDR*`-Marker, Anzahl mit/ohne `x`, Printing in Klammern) werden geparst, strukturell validiert (100-Karten-Regel inklusive Commander, 1-2 Commander, Singleton ausser Basiscards) und deterministisch in das capture-bewaehrte Manabrew-Deckformat (`cards`/`commanders` mit `identity`) konvertiert.
- `DECK-002` ist abgeschlossen: Das erste echte Playgroup-Deck (Golgari-Sacrifice, Commander `Dina, Essence Brewer`, 85 Unique-Karten + 16 Basics) wurde per Textimport geladen, ins Manabrew-Deckformat konvertiert und von Forge in einer echten Vier-Spieler-Partie gestartet; der initiale State zeigt die Commanderin in der Command-Zone und 99 Karten in der Library.

### Was noch nicht existiert

- Die Commander-Oberflaeche ist noch rein statisch: Interaktion, Prompt-Antworten, Highlighting legaler Aktionen und Live-States aus der API fehlen noch.
- Noch kein dauerhafter Game-Orchestrator; die API stellt bisher die Relay-Verbindung und Health-/Status-Endpunkte bereit.
- Keine SQLite-Datenbank oder Deckbibliothek; erst ein echtes Deck ist als Textliste plus Import-Modell unter `decks/` abgelegt.
- Noch kein Proof fuer jede Prompt-Familie; insbesondere Moduswahl, Karten-/Mehrfachzielauswahl, Trigger-Reihenfolge und Combat-Entscheidungen bleiben offen.
- Kein Save/Load-Proof fuer den internen Engine-Zustand.
- Keine GLM-Tutor-Anbindung.
- Kein Invite-/Playgroup-Code.
- Kein getestetes Synology-Deployment.

### Wichtigste Evidence

- Letzter erfolgreicher Real-Capture: `captures/manabrew-real-session-2026-09-17T12-59-23-759Z.summary.json`
- Letzter erfolgreicher Real-Deck-Start: `captures/deck-forge-start-2026-09-26T12-41-15-366Z.summary.json` (Skript `scripts/deck-forge-start.mjs`, Deck `decks/dina-sacrifice.txt`)
- Letzter erfolgreicher Bot-Langlauf: `captures/bot-long-run-2026-09-26T13-32-53-361Z.summary.json` (Skript `scripts/bot-long-run.mjs`, `npm run bot:longrun`)
- Capture-Client: `scripts/capture-real-session.mjs`
- Bot-Langlauf-Client: `scripts/bot-long-run.mjs`
- Lokaler Fixture-PoC: `scripts/protocol-poc.mjs`
- Minimale Protocol-Typen: `packages/shared/src/manabrew-protocol.ts`
- Docker-Setup: `infra/manabrew-forge-room/compose.yml`
- Architekturentscheidung: `docs/architecture.md`
- Relay-Client und Betriebsbeschreibung: `packages/manabrew-client`, `docs/engine-client.md`
- Entscheidungen und Risiken: `docs/wayfinding.md`
- UI-Modell: `packages/shared/src/game-view.ts`, Test `npm run gameview:test`, Doku `docs/ui-model.md`
- Board-Slice: `apps/web/src/game`, Web-Regressionstest `npm run test -w @mtg-commander/web`, sichtbar unter `npm run dev`
- Git-Baseline: Commit `04f9ee9` auf `origin/main` (`https://github.com/FruechteBini/mtg_commander.git`)

## Empfohlene Reihenfolge

1. Produktentscheidung `SAVE-002`: Replay-Journal (Option B) vs. Fork/Upstream (Option C), siehe `docs/save-resume-research.md` (`BOT-002` ist abgeschlossen).
2. Danach UI-Interaktion, Persistenz, Tutor und NAS-Deployment zum Milestone-1-Slice verbinden.
3. Neue Arbeitsstaende werden regulaer auf `main` committed und gepusht.
5. Erkenntnisse fliessen zurueck in Ticketstatus, Evidence und Wayfinding.

## Ticketuebersicht

### P0: Unmittelbar und Milestone-kritisch

| ID | Status | Ticket | Ergebnis |
| --- | --- | --- | --- |
| `BOOT-001` | `DONE` | Git-Baseline und klonbaren Projektstand herstellen | Branch `main` ist sauber versioniert, gepusht und klonbar. |
| `PROTO-004` | `DONE` | Mehrstufige echte Aktion capturen | Spell inklusive Ziel-, Mana-, Prioritaets- und Aufloesungsloop bewiesen. |
| `PROTO-005` | `DONE` | Reale DTOs gegen TypeScript-Vertrag abgleichen | App nutzt belegte statt angenommene Protocol-Typen. |
| `PROTO-006` | `DONE` | Live-Parser-Toleranz roomRelay/Fingerprint | BOT-002-Live-Nachrichten parsen ohne invalidMessage; gameOver-Sentinel beendet den Lauf sauber. |
| `ARCH-001` | `DONE` | Prozess- und Lizenzgrenze festlegen | UI, API, Relay und Engine haben klare Verantwortungen. |
| `APP-001` | `DONE` | React/TypeScript- und API-Grundgeruest erstellen | Startbare Web-App plus API- und Shared-Packages. |
| `ENGINE-001` | `DONE` | Wiederverwendbaren Manabrew-Client bauen | API und Capture nutzen dieselbe validierte Relay-/Game-Bibliothek. |
| `UI-001` | `DONE` | `gameView` in ein stabiles UI-Modell normalisieren | Vier Spieler, Zonen, Stack und Prioritaet sind renderbar. |
| `UI-002` | `DONE` | Ersten Hybrid-Commander-Board-Slice bauen | Statisches Board rendert Fixture- und Capture-States; Rollen, Prioritaet und Stack sind sichtbar. |
| `DECK-001` | `DONE` | Neutralen Commander-Decklistenimport definieren | Textliste wird geparst, validiert und ins Manabrew-Deckformat konvertiert. |
| `DECK-002` | `DONE` | Erstes echtes Playgroup-Deck importieren | Reales Deck startet in Forge/Manabrew. |
| `BOT-002` | `DONE` | Vier-Spieler-Langlauf mit realistischen Decks testen | 66 Turns Mensch + 3 Bots ohne Deadlock/Stall; Speicher linear stabil. |
| `SAVE-001` | `DONE` | Engine-Snapshot/Save/Resume untersuchen | No-Go dokumentiert: Upstream-Node hat keinen Save/Restore; Alternativen A/B/C in `docs/save-resume-research.md`. |

### P1: Fuer Milestone 1 erforderlich

| ID | Status | Ticket | Ergebnis |
| --- | --- | --- | --- |
| `API-001` | `BLOCKED` | Node/TypeScript-API und SQLite-Schema bauen | Decks, Spiele, Saves und Logs haben persistente IDs. |
| `SAVE-002` | `BLOCKED` | Versionierte Saves implementieren | Wartet auf Produktentscheidung B vs. C (`docs/save-resume-research.md`); Engine-Restore nur mit Fork/Upstream. |
| `UI-003` | `BLOCKED` | Assistierte Prompt-Interaktion implementieren | Legale Karten/Aktionen werden hervorgehoben und beantwortet. |
| `UI-004` | `BLOCKED` | Manual Mode definieren und bauen | Erfahrene Spieler koennen Pass-/Prioritaetsverhalten steuern. |
| `GLM-001` | `BLOCKED` | Strukturiertes Tutor-Kontextschema definieren | GLM erhaelt nur belegte Engine-Ereignisse und sichtbaren Kontext. |
| `GLM-002` | `BLOCKED` | Server-seitigen Explain-Endpunkt bauen | Ein Ereignis kann auf Nachfrage erklaert werden, Key bleibt serverseitig. |
| `AUTH-001` | `BLOCKED` | Privaten Invite-/Playgroup-Code bauen | Zugriff ohne oeffentliches Accountsystem. |
| `LOG-001` | `BLOCKED` | Strukturierte Spiel- und Fehlerlogs definieren | Debugging ohne rohe Secrets oder versteckte Handinformationen. |
| `OPS-001` | `BLOCKED` | Compose-Stack fuer die komplette App erstellen | API, UI, Relay und Forge starten gemeinsam. |
| `OPS-002` | `BLOCKED` | Synology-6-GB-Ressourcentest durchfuehren | Vier-Spieler-Partie bleibt innerhalb dokumentierter CPU/RAM-Grenzen. |
| `TEST-001` | `BLOCKED` | Vertikalen Milestone-1-E2E-Test erstellen | Import -> Spiel -> Aktion -> Save -> Load -> Explain ist reproduzierbar. |
| `LEGAL-001` | `RESEARCH` | Lizenz- und Asset-Grenzen dokumentieren | AGPL/Forge/Protocol/Card-Art-Nutzung ist fuer den privaten Betrieb klar. |

### P2: Qualitaet, Betrieb und spaetere Produktreife

| ID | Status | Ticket | Ergebnis |
| --- | --- | --- | --- |
| `BOT-003` | `READY` | Deterministische einfache Bot-Policy bewerten | Bekannte Auswahlstrategie fuer legale Aktionen. |
| `PERF-001` | `BLOCKED` | Grosse Commander-Boardstates testen | UI und State-Verarbeitung bleiben lesbar und schnell. |
| `TEST-002` | `BLOCKED` | Protocol-Fixtures und Regressionstests ausbauen | Captures koennen offline reproduziert werden. |
| `SEC-001` | `READY` | Capture- und Log-Datenschutz pruefen | Keine Secrets oder ungewollten privaten Daten im Repository. |
| `DOC-001` | `IN PROGRESS` | Projektboard laufend pflegen | Jeder Rechner hat denselben aktuellen Einstiegspunkt. |

### Optional und bewusst nicht fuer Milestone 1

| ID | Status | Ticket | Hinweis |
| --- | --- | --- | --- |
| `OPT-001` | `OPTIONAL` | Tauri-Desktop-Paket | Erst nach stabilem Browser-Slice. |
| `OPT-002` | `OPTIONAL` | Automatische mythic.tools-Synchronisierung | Manueller Link-/Textimport reicht zuerst. |
| `OPT-003` | `OPTIONAL` | Strategische GLM-Bots | GLM bewertet nur Engine-legale Optionen. |
| `OPT-004` | `OPTIONAL` | Teilbare Logs per Link | Exportdatei ist die einfachere Vorstufe. |
| `OPT-005` | `OPTIONAL` | Menschlicher Multiplayer | Erst nach stabilem Solo-vs-Bots-Slice. |
| `OPT-006` | `OPTIONAL` | Mobile UI | Desktop-PC bleibt erstes Ziel. |
| `OPT-007` | `OPTIONAL` | Replay/Undo/History | Nicht mit Save/Load verwechseln. |
| `OPT-008` | `OPTIONAL` | Save-Migration ueber viele Engine-Versionen | MVP braucht nur ein versioniertes aktuelles Format. |
| `OPT-009` | `OPTIONAL` | Arena-aehnliche Animationen | Lesbarkeit und korrekte Interaktion haben Vorrang. |
| `OPT-010` | `DEFERRED` | Oeffentliche Accounts und Matchmaking | Fuer die private Playgroup nicht erforderlich. |
| `OPT-011` | `DEFERRED` | Monetarisierung oder oeffentliches Produkt | Ausserhalb des aktuellen Produktziels. |

## Detaillierte aktive Tickets

### BOOT-001 - Git-Baseline und klonbaren Projektstand herstellen

- **Status:** `DONE`
- **Prioritaet:** P0
- **Warum:** Ein versionierter und gepushter Baseline-Stand ist Voraussetzung fuer sichere Backups und das Weiterarbeiten auf anderen Rechnern.
- **Aufgaben:**
  - Alle vorgesehenen Dateien und Ignore-Regeln pruefen.
  - Entscheiden, welche Capture-Summaries als dauerhafte Evidence bleiben; rohe JSONL-Captures bleiben ignoriert.
  - Ersten Commit erstellen.
  - Remote-URL setzen und Branch pushen.
  - Clone-/Bootstrap-Anleitung mit der echten Remote-URL ergaenzen.
- **Akzeptanzkriterien:**
  - `git status` ist nach dem Commit sauber.
  - Ein frischer Clone enthaelt README, Projektboard, Scripts, Compose und mindestens die neueste erfolgreiche Capture-Summary.
  - Lokale `.env` und rohe JSONL-Captures fehlen im Clone.
- **Ergebnis (2026-09-19):** Der lokale Branch wurde auf `main` gesetzt, mit `origin/main` verbunden und als Commit `04f9ee9` (`Complete Manabrew protocol capture and validation`) nach GitHub gepusht. `git status` war danach sauber und `HEAD`, `origin/main` sowie `origin/HEAD` zeigten auf denselben Commit.
- **Remote:** `https://github.com/FruechteBini/mtg_commander.git`
- **Evidence:** Commit `04f9ee9`; der versionierte Baum enthaelt README, Projektboard, Scripts, Compose-Setup und die erfolgreiche Capture-Summary vom 17. September 2026. `.env` und rohe `captures/*.jsonl` bleiben durch `.gitignore` ausgeschlossen.

### PROTO-004 - Mehrstufige echte Aktion capturen

- **Status:** `DONE`
- **Prioritaet:** P0
- **Abhaengigkeit:** Docker-Engine aus `docs/real-engine-poc.md` laeuft.
- **Ausgangslage:** Eine einfache Land-Aktion war bereits Ende-zu-Ende bewiesen. Mana-, Ziel- und Stack-Folgeprompts waren noch offen.
- **Aufgaben:**
  - Testdeck so anpassen, dass frueh ein guenstiger Nichtland-Zauber oder eine aktivierte Faehigkeit verfuegbar ist.
  - Action-Auswahl gezielt auf dieses Testobjekt lenken.
  - `payManaCost`, Ziel-, Modus- und sonstige Folgeprompts generisch protokollieren und legal beantworten.
  - Nicht beim ersten Fingerprint-Wechsel stoppen, sondern eine echte Aufloesungsbedingung pruefen.
  - Vorher-/Nachher-State derselben Spielerperspektive in der Summary speichern.
- **Akzeptanzkriterien:**
  - `act` nutzt eine von der Engine gelieferte `actionId`.
  - Alle erforderlichen Folgeprompts werden mit zugehoeriger `promptId` beantwortet.
  - Der erwartete Stack-/Zonen-/Permanent-Effekt ist im State sichtbar.
  - Keine `error`- oder `fatal`-Envelope.
  - Evidence und Ergebnis werden in diesem Board sowie in den Protocol-/Engine-Dokumenten festgehalten.
- **Execution log (2026-09-17):** Der Capture wird auf `Shock` als gezielten Ein-Mana-Testzauber umgestellt. Der Client soll zuerst ein Mountain spielen, danach `Shock` waehlen, eine angebotene Manafaehigkeit aktivieren, die Zahlung bestaetigen, ein gegnerisches `TargetRef` auswaehlen und erst bei `hand -> graveyard` plus gesunkenen Ziel-Lebenspunkten erfolgreich enden.
- **Ergebnis (2026-09-17):** Erfolgreicher Vier-Spieler-Capture `manabrew-real-session-2026-09-17T12-59-23-759Z`. Prompt-Kette: `chooseAction:act` -> `chooseBoardTargets:boardTargets` -> `payManaCost:act` -> `payManaCost:pay(auto:false)` -> `chooseAction:pass`. `Shock` wechselte von `hand` zu `graveyard`, der Stack endete leer, `player-1` fiel von 40 auf 38 Leben und es gab keine Engine-/Protocol-Fehler.
- **Gelernt:** Bei bereits produziertem Mana bestaetigt die Manabrew-UI mit `pay(auto:false)`. `auto:true` startet die automatische Bezahlroutine erneut und erzeugte im ersten Versuch eine Prompt-Schleife. Der Capture besitzt deshalb jetzt zusaetzlich einen Guard nach zehn Mana-Prompts.
- **Evidence:** `captures/manabrew-real-session-2026-09-17T12-59-23-759Z.summary.json`, `scripts/capture-real-session.mjs`; Prompt-Vertrag gegen Manabrew Commit `df1954b4dd0748129b2869435b89f66413539182` geprueft.

### PROTO-005 - Reale DTOs gegen TypeScript-Vertrag abgleichen

- **Status:** `DONE`
- **Prioritaet:** P0
- **Warum:** `packages/shared/src/manabrew-protocol.ts` entstand zuerst aus Dokumentation und Fixture. Reale Felder unterscheiden sich teilweise, zum Beispiel `turn` statt `turnNumber` und Manabrews Land-Aktion mit `type: "cast"` und Label `Play Mountain`.
- **Aufgaben:**
  - Reale `state`, `stateDelta`, `prompt`, `error`, Lobby- und Game-Start-Envelopes inventarisieren.
  - Transport-Envelopes und Engine-Nachrichten getrennt typisieren.
  - Sichtbarkeit/Redaction und optionale Felder korrekt modellieren.
  - Fixture auf echte Feldformen aktualisieren oder zusaetzliche Real-Fixtures anlegen.
  - Runtime-Validierung fuer externe Nachrichten festlegen.
- **Akzeptanzkriterien:**
  - Der letzte Capture laesst sich ohne unsichere Annahmen parsen.
  - TypeScript-Typen decken State, Prompt, Response und Fehler des bewiesenen Loops ab.
  - Mindestens ein Offline-Regressionstest prueft State -> Prompt -> Response -> State.
- **Ergebnis (2026-09-17):** Relay-Transport (`type`) und darin transportierte Engine-Envelopes (`kind`) sind getrennt typisiert. `state`, `stateDelta`, `prompt`, Engine-Fehler, Lobby, `GameStarted` und `BroadcastState`-Responses besitzen explizite Vertraege. `chooseAction`, `chooseBoardTargets` und `payManaCost` bilden den echten Shock-Loop ab; `GameViewDto` nutzt das reale Feld `turn`. Hidden-Zonen duerfen korrekt `count > 0` bei leerem `cards` haben.
- **Runtime-Validierung:** `packages/shared/src/manabrew-protocol-parser.mjs` prueft externe Nachrichten an der Grenze, behaelt zusaetzliche Felder fuer Vorwaertskompatibilitaet bei und verwirft strukturell ungueltige bekannte Nachrichten mit einem Pfadfehler.
- **Regression:** `node scripts/protocol-contract-test.mjs` validiert das sanitisiert gespeicherte State -> Prompt -> Response -> State-Fixture, alle vier Schritte des Shock-Loops, den Lebensverlust und zwei negative Parserfaelle. Wenn der lokale Raw-Capture vorhanden ist, werden zusaetzlich alle 228 Relay-Nachrichten daraus gestreamt und validiert. `npm run protocol:test` ist als Alias hinterlegt; im aktuellen Codex-Runtime-Pfad ist `npm` selbst nicht verfuegbar.
- **Abgrenzung:** Der erfolgreiche Capture enthielt 130 volle `state`- und 28 `prompt`-Envelopes, aber kein reales `stateDelta`, `error` oder `fatal`. Deren Contract ist inventarisiert und bewusst noch nicht als real beobachtet behauptet.
- **Evidence:** `packages/shared/src/manabrew-protocol.ts`, `packages/shared/src/manabrew-protocol-parser.mjs`, `packages/shared/fixtures/protocol-session.json`, `scripts/protocol-contract-test.mjs`, `captures/manabrew-real-session-2026-09-17T12-59-23-759Z.jsonl` (lokal/ignoriert).

### PROTO-006 - Live-Parser-Toleranz fuer roomRelay und Fingerprint

- **Status:** `DONE` (2026-09-26, Follow-up aus `BOT-002`)
- **Prioritaet:** P2
- **Akzeptanzkriterien:** Die vier invalidMessage-Funde aus dem BOT-002-Langlauf (2x `roomRelay`-Heartbeat als `StateUpdate`, 2x State ohne String-Fingerprint) parsen klaglos; bekannte Fehler bleiben Fehler; der terminale `gameOver`-Prompt beendet einen Langlauf aktiv.
- **Ergebnis:** `parseEngineEnvelope` akzeptiert jetzt `kind: "roomRelay"` mit toleranter Feldpruefung (`protocol`/`version`/`messageId`/`fromPlayer`/`roomId`/`payload` optional, da Heartbeat-Varianten Felder weglassen koennen) und toleriert fehlende Fingerprints bei `kind: "state"` (beobachtet bei Broadcast-Final-States); `stateDelta` bleibt strikt, weil `base`/`fingerprint` dort semantisch Patch-Basis sind. TypeScript-Seite: `StateUpdateMessage.state` um `RoomRelayEnvelope` erweitert und `StateEnvelope.fingerprint` optional. `scripts/bot-long-run.mjs` zaehlt roomRelay-Envelopes in der Summary (statt invalid) und beendet den Lauf beim `gameOver`-Prompt (Sentinel-`promptId` u32::MAX, keine Antwort erwartet) aktiv mit `game-over-at-turn-N`, statt ihn als unsupported zu fuehren.
- **Regression:** `scripts/protocol-contract-test.mjs` prueft neu: vollstaendiger und minimaler roomRelay-StateUpdate, ein aus dem Fixture abgeleiteter State ohne Fingerprint sowie negativ weiterhin unbekannte `kind`-Werte.
- **Evidence:** Funde in `captures/bot-long-run-2026-09-26T13-32-53-361Z.summary.json` (`errors[0..3]`); Aenderungen in `packages/shared/src/manabrew-protocol-parser.mjs`, `packages/shared/src/manabrew-protocol.ts`, `scripts/bot-long-run.mjs`, `scripts/protocol-contract-test.mjs`.

### ARCH-001 - Prozess- und Lizenzgrenze festlegen

- **Status:** `DONE`
- **Prioritaet:** P0
- **Fragen:**
  - Laeuft die Engine dauerhaft separat von der Node-API?
  - Ist die API Relay-Client, Orchestrator oder nur Persistenz-/GLM-Service?
  - Spricht der Browser direkt mit dem Relay oder ueber die API?
  - Welche Teile implementieren nur das CC-BY-Protokoll und welche koppeln an AGPL/Forge-Code?
- **Empfohlene Richtung:** Browser -> eigene API/WebSocket-Schicht -> Manabrew Relay/Forge; Secrets, Saves und GLM bleiben serverseitig.
- **Akzeptanzkriterien:** Ein kleines Architekturdiagramm und eine Entscheidung mit Konsequenzen fuer Deployment, Lizenz, Secrets und Reconnects liegen vor.
- **Ergebnis (2026-09-26):** Der Browser spricht ausschliesslich per HTTPS/WSS mit der eigenen Node-API. Die API ist Backend-for-Frontend, Relay-Client und Spiel-Orchestrator. Relay und Forge-backed node bleiben getrennte interne Container; SQLite, Decks, Saves und GLM-Secrets bleiben serverseitig. Ausfall- und Reconnect-Verhalten ist fuer Browser, API, Relay, Engine und Z.AI getrennt beschrieben. Die eigene Protokollimplementierung stuetzt sich auf die CC-BY-4.0-Spezifikation; Manabrew-/Forge-Komponenten und deren AGPL-/GPL-Pflichten bleiben getrennt sichtbar. Vollstaendige Asset-/Lizenzpruefung bleibt `LEGAL-001`.
- **Evidence:** `docs/architecture.md`; Manabrew `LICENSE.md` am festgehaltenen Commit `cfaf2431c872b87fc8a7208e873a92140755f47d`; Manabrew-Protokolldokumentation; GNU AGPL 3.0 Abschnitt 13; CC-BY-4.0 Abschnitt 3.
- **Konsequenz:** `APP-001` und `ENGINE-001` konnten auf dieser Grenze umgesetzt werden. Direkte Browser-Relay-Kommunikation und Secrets im Browser sind fuer Milestone 1 ausgeschlossen.
- **Offene Nachweise:** Menschlichen Sitz nach API-/Relay-Neustart wiederaufnehmen, echten Engine-Restore beweisen sowie Projekt-/Asset-Lizenzen in `LEGAL-001` abschliessen.

### APP-001 - Web-/API-Grundgeruest erstellen

- **Status:** `DONE`
- **Prioritaet:** P0
- **Zielstruktur:** React/TypeScript-Web-App, Node/TypeScript-API und Shared-Package in einem Workspace.
- **Akzeptanzkriterien:**
  - Ein dokumentierter Install-/Startbefehl funktioniert auf einem frischen Clone.
  - Web und API haben Healthchecks.
  - Shared Protocol-/Domain-Typen werden von beiden verwendet.
  - Keine Secrets landen im Browser-Bundle.
- **Ergebnis (2026-09-26):** npm-Workspaces verbinden `apps/web`, `apps/api` und `packages/shared`. Die React-/Vite-App zeigt den API-Status ueber den lokalen `/api`-Proxy. Die Node-/TypeScript-API bietet `/healthz`, `/readyz` und den oeffentlichen `/api/status`. Gemeinsame Health-/Statusvertraege liegen im Shared-Package; die bestehenden Manabrew-Protokolltypen werden dort weitergefuehrt.
- **Start:** `npm install`, danach `npm run dev`; Web unter `http://127.0.0.1:5173`, API unter `http://127.0.0.1:8787`.
- **Evidence:** `npm run typecheck`, `npm test` und `npm run build` bestanden. Drei API-Tests pruefen Liveness/Readiness, den oeffentlichen Status ohne serverseitige Test-Secrets und JSON-404. Im realen gemeinsamen Dev-Lauf lieferten Web- und API-Healthchecks HTTP 200; der Web-Proxy erreichte Protocol-Version 5 der API.
- **Abgrenzung:** Das Grundgeruest enthielt noch keine Relay-Verbindung; diese wurde in `ENGINE-001` ergaenzt. SQLite, Auth und GLM sind eigene Folgetickets.

### ENGINE-001 - Wiederverwendbaren Manabrew-Client bauen

- **Status:** `DONE`
- **Prioritaet:** P0
- **Aufgaben:** Auth, Room-Liste, Join, Deckwahl, Ready, Bot-Batch, Start, Resync, State/Delta, Prompt/Response, Reconnect und Fehlerbehandlung aus dem Capture-Skript in eine testbare Bibliothek extrahieren.
- **Akzeptanzkriterien:** Das Capture-Skript und spaeter die API koennen denselben Client verwenden; keine duplizierte Protocol-Logik.
- **Ergebnis (2026-09-26):** `packages/manabrew-client` kapselt die komplette Relay-Verbindung und validiert eingehende Nachrichten mit dem gemeinsamen Protocol-Parser. Das Capture-Skript nutzt die Bibliothek fuer Auth, Raum, Deck, Ready, Bot-Batch, Start, Resync und Antworten. Die API startet denselben Client serverseitig aus `.env`, meldet seinen Status ueber `/api/status` und reconnectet nach Verbindungsabbruechen mit begrenztem exponentiellem Backoff. Authentifizierungsfehler werden nicht endlos wiederholt.
- **Evidence:** Fuenf Client-Tests pruefen Befehlsformen, State/Delta/Prompt/Fehler, ungueltige Nachrichten, Reconnect und abgelehnte Authentifizierung. `npm run typecheck`, `npm test` und `npm run build` bestehen. `npm run engine:smoke` authentifiziert den neuen Client am echten lokalen Relay und findet den konfigurierten Forge-Raum. Der bestehende Vier-Spieler-Capture belegt die verwendeten realen Nachrichtenformen.
- **Naechster Schritt:** Keiner offen aus diesem Ticket; `UI-001` hat auf diesem Client aufgebaut und ist abgeschlossen.

### UI-001 - `gameView` normalisieren

- **Status:** `DONE`
- **Prioritaet:** P0
- **Aufgaben:** Normalisiertes Modell fuer Spieler, Zonen, sichtbare/verdeckte Karten, Stack, Zug/Phase, Prioritaet, Combat, Commander-Schaden und aktive Sonderrollen definieren.
- **Akzeptanzkriterien:** Ein echter Capture-State wird deterministisch in ein UI-Modell fuer vier Spieler transformiert.
- **Ergebnis (2026-09-26):** `packages/shared/src/game-view.ts` definiert das versionierte UI-Modell (`UI_MODEL_VERSION 1`) und projiziert echte Engine-`gameView`-Objekte rein und total: Spieler mit Leben, Sitz, Prioritaet und Mana-Pool; pro Spieler sechs Zonen in fester Reihenfolge (battlefield, hand, library, graveyard, exile, command; unbekannte Rohzonen wie sideboard landen als `unknown` hinten); Karten mit Sichtbarkeit, Farben, Kreaturenwerten (Strings wegen `*`) und Markern; Stack, Zug/Phase inklusive `displayTurn`, Combat-Flag, Sonderrollen sowie Commander-Casts/-Schaden als sortierte Arrays. `normalizeStateEnvelope` akzeptiert nur echte State-Envelopes und uebernimmt deren Perspektive.
- **Evidence:** `scripts/game-view-normalizer-test.mjs` prueft das Vier-Spieler-Fixture `packages/shared/fixtures/game-view-four-player.json`, den Shock-Vorher/Nachher-Wechsel (Leben 40 -> 38, hand -> graveyard), Determinismus unter Schluesselumordnung, defensive Fallbacks und streamt optional alle lokalen Raw-Capture-States durch das Modell (aktuell 2). `npm run gameview:test`, `npm run typecheck`, `npm test` und `npm run build` bestehen. Modell-Doku: [docs/ui-model.md](ui-model.md).
- **Naechster Schritt:** Erfuellt - `UI-002` rendert das Modell als ersten statischen Board-Slice (siehe unten).

### UI-002 - Hybrid-Commander-Board-Slice

- **Status:** `DONE`
- **Prioritaet:** P0
- **Layout:** Eigener Bereich gross; drei Gegner kompakt und aufklappbar; Stack/Prompt gut sichtbar; Desktop zuerst.
- **Akzeptanzkriterien:** Fixture und Real-Capture koennen statisch gerendert werden; aktive/legale Karten und aktueller Spieler sind erkennbar.
- **Ergebnis (2026-09-26):** `apps/web/src/game/` rendert `NormalizedGameView` als ersten statischen Hybrid-Board-Slice: Turn-Bar mit Zug/Phase/Schritt, aktivem Spieler und Prioritaet; drei kompakte aufklappbare Gegner-Panels mit Zonen-Zaehlungen und Rollen-Badges; grosser eigener Bereich mit Schlachtfeld (Kreaturenwerte, getappt/aufrufkrank/Token-Marker), Hand, Kommandozone inklusive Casts, Bibliothek/Friedhof/Exil und Mana-Pool; rechts Stack mit auf Spieler aufgeloesten Zielen und Prompt-Platzhalter. Ein Capture-Loader rendert eingefuegte `StateUpdate`-Nachrichten, State-Envelopes oder rohe `gameView`-Objekte aus `captures/*.jsonl` statisch.
- **Evidence:** Web-Regressionstest `apps/web/src/game/view-model.test.ts` (7 Tests: Labels, Viewer-Perspektive, verdeckte Bibliotheken, Karten-Badges, Mana-Reihenfolge, Capture-JSON-Akzeptanz und -Ablehnung) laeuft in `npm test`; `npm run typecheck`, `npm test` und `npm run build` bestehen. Sichtbar unter `npm run dev` -> `http://127.0.0.1:5173`.
- **Naechster Schritt:** Interaktiver Slice: Prompt-Antworten senden, legale Aktionen hervorheben und Live-States ueber die API; parallel dazu `DECK-001` starten.

### DECK-001 - Neutraler Decklistenimport

- **Status:** `DONE` (2026-09-26)
- **Prioritaet:** P0
- **Scope:** Text-/Dateiimport zuerst, keine automatische mythic.tools-Synchronisierung.
- **Daten:** Besitzer, Deckname, Commander, Karten mit Anzahl/Printing, Quelle, Quell-URL und Importzeitpunkt.
- **Akzeptanzkriterien:** Eine typische Commander-Textliste wird in ein 100-Karten-Modell geparst, validiert und in das Manabrew-Deckformat konvertiert.
- **Ergebnis:** `packages/shared/src/deck-list.ts` parst typische Exporte (Sektionen `Deck`/`Commander`/`Sideboard`/`Maybeboard`, `*CMDR*`-Marker, Anzahl mit/ohne `x`, Printing `(SET) 123`, Zeilen ohne Anzahl als 1x), validiert strukturell (genau 100 inklusive 1-2 Commander, Singleton ausser Basiscards, Commander nicht doppelt im 99) und liefert ein Import-Modell mit Besitzer, Quelle, Quell-URL und Importzeitpunkt (Zeit wird vom Aufrufer uebergeben, Modul bleibt pur). `toManabrewDeckSelection()` erzeugt deterministisch das capture-bewaehrte Deckformat (`{ name, format: "commander", cards, commanders }` mit `identity`, Mengen expandiert, Ids als Slugs).
- **Evidence:** Regressionstest `npm run deck:test` (`scripts/deck-import-test.mjs`): Happy Path (100er-Liste mit Printing und Sideboard), Manabrew-Konvertierung inkl. Determinismus, Fehlerfaelle (99 statt 100, Singleton-Verstoss, Commander doppelt, kein/zu vieler Commander), Partner-Commander, Commander nur via Meta-Angabe, defensible Eingaben. Laeuft in der `npm test`-Kette.
- **Naechster Schritt:** `DECK-002` - erstes echtes Playgroup-Deck importieren und in Forge starten.

### DECK-002 - Erstes echtes Playgroup-Deck

- **Status:** `DONE` (2026-09-26)
- **Prioritaet:** P0
- **Akzeptanzkriterien:** Ein echtes mythic.tools-/Export-Deck wird importiert, von Forge akzeptiert und startet in einem Vier-Spieler-Spiel.
- **Ergebnis:** Das erste echte Playgroup-Deck (Golgari-Sacrifice, Commander `Dina, Essence Brewer`) liegt als exportierte Textliste unter `decks/dina-sacrifice.txt`, wurde ueber `importCommanderDeck` (Meta-Commander, da kein `*CMDR*`-Marker) in ein valides 100-Karten-Modell ueberfuehrt (85 Unique-Karten, 16 Basics, Import-Modell `decks/dina-sacrifice.json`) und per `toManabrewDeckSelection` konvertiert. Das Beweisskript `scripts/deck-forge-start.mjs` startete damit eine echte Vier-Spieler-Partie (Mensch + 3 Bots, alle mit dem echten Deck); der initiale State zeigt fuer Spieler 1 die Commanderin in der Command-Zone und 99 Karten in der Library.
- **Evidence:** `captures/deck-forge-start-2026-09-26T12-41-15-366Z.summary.json` (Exit 0, `proof-complete: commanderInCommand true, libraryCount 99`); Verbindung mit lokalem Server-Key/Raum-Passwort aus `infra/manabrew-forge-room/.env`.
- **Erkenntnisse:** Forge loest alle 85 Karten (inkl. neuer Karten wie `Dina, Essence Brewer`, Set `SOC`) sauber per Namen auf - auch ohne Printing-Angaben. `gameView.zones` ist pro Spieler (`ownerId`) modelliert; verdeckte Zonen liefern `count` ohne `cards`, Kartennamen liegen in `cardView.identity.name`. Nach einem beendeten Spiel ist der Raum belegt (`game_already_started`, `MAX_GAMES=1`); ein Compose-Restart setzt den Raum zurueck.
- **Naechster Schritt:** Erfuellt - der `BOT-002`-Langlauf lief 66 Turns mit dem echten Deck; offener Punkt ist nur die `SAVE-002`-Produktentscheidung.

### BOT-002 - Vier-Spieler-Langlauf

- **Status:** `DONE` (2026-09-26)
- **Prioritaet:** P0
- **Akzeptanzkriterien:** Mindestens eine festgelegte Anzahl Zuege mit einem Menschen-/Capture-Client und drei Bots; keine Deadlocks, ungestuetzten Prompts oder unkontrollierten Speicheranstiege.
- **Ergebnis:** Das Beweisskript `scripts/bot-long-run.mjs` (`npm run bot:longrun`; Zielzugzahl, Timeout, Stall-Watchdog, Grace-Phase und Docker-Speichersampling per Env konfigurierbar) fuehrte eine echte Vier-Spieler-Partie (1 Capture-Mensch + 3 Bots auf einem self-hosted node, alle mit dem echten Deck `decks/dina-sacrifice.txt`) ueber **66 Turns bis zum natuerlichen GameOver** ohne Deadlock oder Engine-Fehler: 3.871 States, 759 Prompt-Envelopes, 758 Antworten (`diceRolledAcknowledged` 1, `mulliganDecision` 1, `pass` 746, `act` 8 - Land-Policy nach `Play <Land>`-Label/`playLand`-Typ, `revealCardsAcknowledged` 2). Speicher des forge-room-Containers: 246,9 -> 340,5 MiB ueber 66 Turns (10 Samples, linear mit Spielhistorie, kein unkontrollierter Anstieg; CPU-Peaks ~195 % beim Bot-Ticken). Der finale GameOver-Prompt kommt mit `promptId` u32::MAX (4294967295) und erwartet keine Antwort.
- **Evidence:** `captures/bot-long-run-2026-09-26T13-32-53-361Z.summary.json` (Exit 0, `turns-reached`, `maxTurn: 66`); Vorlaeufe: `bot-long-run-2026-09-26T13-22-04-143Z` (8 Turns, erste Land-`act`-Antwort), `bot-long-run-2026-09-26T13-26-25-384Z` (Deckte `revealCards`-Blockade bei Turn 10 auf), `bot-long-run-2026-09-26T13-30-59-112Z` (12 Turns + Grace, deckte `chooseCards` auf). Antwortstrukturen gegen manabrew-rs Commit `3586834` belegt (`crates/manabrew-protocol/src/prompts/reveal.rs`, `choose_cards.rs`, `choose_boolean.rs`, `scry.rs`, `reorder.rs`).
- **Erkenntnisse:** (1) Die bewaehrten Prompt-Familien reichen fuer einen passiven Sitz nicht: Reale Decks erzeugen zusaetzlich mindestens `revealCards` (nicht abbrechbar, blockiert sonst die Engine) und `chooseCards`; der Client kennt jetzt beide plus `chooseBoolean`, `scry`, `reorder` präventiv. (2) Der self-hosted node sendet `roomRelay`-Heartbeats als `StateUpdate` mit `kind: "roomRelay"` - der Shared-Parser lehnt sie als invalid ab (harmlos, aber Protokoll-Luecke). (3) Zwei Live-Nachrichten wurden wegen `state.fingerprint: expected string` abgelehnt - der Parser braucht Toleranz fuer fehlende/anders getypte Fingerprints. (4) Nach Node-Restart dauert die Raumregistrierung ~50-70 s, und mehrere Raeume gleichen Namens koennen existieren - der Langlauf-Client wartet auf den Raum und waehlt den mit `status: "Lobby"`. (5) Nach wie vor gilt: Ein Spiel belegt den Raum bis zum Stack-Neustart (`MAX_GAMES=1`), und der Relay haelt den Raum auch nach Node-Restart. (6) Noch nie gesehene Familien (`chooseColor`, `chooseNumber`, `chooseAttackers`/`chooseBlockers`, Combat-Damage-Zuordnung, `chooseFromSelection`) bleiben PROTO-Backlog.
- **Naechster Schritt:** `SAVE-002`-Produktentscheidung (Option B vs. C); optional Parser-Toleranz fuer `roomRelay`/Fingerprint als kleines PROTO-Ticket.

### SAVE-001 - Save/Resume-Faehigkeit erforschen

- **Status:** `DONE` (2026-09-26)
- **Prioritaet:** P0
- **Aufgaben:** In Manabrew/Forge nach Snapshot-, Serialize-, Save-, Replay- und Resume-Pfaden suchen. Minimaltest: Spiel starten, internen Zustand sichern, Engine-Prozess neu starten, Zustand laden und legal fortsetzen.
- **Wichtig:** Ein `gameView` ist nur eine Spieleransicht und kein ausreichender Save des vollstaendigen versteckten Engine-Zustands.
- **Ergebnis:** **No-Go** fuer echten Engine-Restore im Upstream-Stack: Das Forge-Backend-FFI hat keinen Save/Load-Entrypoint, Sessions leben nur im RAM (keine Volumes), `restoreSnapshot` ist im Java-Backend explizit unsupported, die Checkpoint-Mechanik gehoert zur Rust-Engine (In-Memory-Zug-Undo), der Relay persistiert keine Games (nur ChatHistory), und der Partie-Seed wird per `rand::random()` gewaehlt und nicht veroeffentlicht. Der geplante Minimaltest ist damit am unveraenderten Stack gegenstandslos; das dokumentierte No-Go ersetzt ihn.
- **Alternativarchitektur:** Option A (Partie als unterbrochen markieren, Status quo), Option B (Replay-Journal: Startbedingung + geordnete Prompt-Antworten; braucht Determinismus-Beweis und Upstream-Seed-Kontrolle), Option C (Fork/Upstream: `forge_save_game`/`forge_load_game` in der forge-harness).
- **Evidence:** `docs/save-resume-research.md` (Beweiskette mit Datei/Zeilen-Referenzen gegen Manabrew-Clone `35868343c77132714e43b6a227092658f956296a`), `docker inspect`/`docker logs` des forge-room-Containers.
- **Naechster Schritt:** Produktentscheidung fuer `SAVE-002` (B vs. C).

## Weitere Milestone-1-Tickets

### API-001 - Persistenzmodell

- SQLite-Schema fuer Playgroup, Invite-Code, Deck, Deckversion, Game, Engine-Version, Save und Log definieren.
- Migrationen von Anfang an versionieren.
- Keine GLM- oder Relay-Secrets in Spiel-/Logtabellen speichern.

### SAVE-002 - Versionierte Saves

- **Status:** `BLOCKED` (wartet auf Produktentscheidung Option B vs. C, siehe `docs/save-resume-research.md`)
- Save-Envelope mit eigener Schema-Version, Engine-/Protocol-Version, Deckversionen und Zeitstempel.
- SAVE-001-No-Go: "Partie nach Prozessneustart fortsetzen" ist nur mit Fork/Upstream (Option C) erreichbar. Option B (Replay-Journal) liefert versionierte Wiederherstellung ueber deterministischen Replay; dafuer muessen Forge-Determinismus bewiesen und die Seed-Kontrolle upstream geklaert werden.
- MVP braucht keine beliebigen Langzeitmigrationen, aber inkompatible Saves muessen klar erkannt werden.

### UI-003 - Assistierte Interaktion

- Engine-legale Aktionen markieren.
- Prompt-spezifische Oberflaechen fuer Ziele, Modi, Mana, Reihenfolge, Mulligan und Pass anbieten.
- Fehler der Engine sichtbar und wiederherstellbar behandeln.

### UI-004 - Manual Mode

- Auto-Pass-/Stop-Regeln definieren.
- Wechsel zwischen assistiertem Modus und manueller Prioritaet ohne unterschiedlichen Regelpfad.

### GLM-001 / GLM-002 - Tutor

- GLM erklaert, entscheidet aber im ersten Meilenstein keine Regeln.
- Kontext besteht aus strukturiertem Ereignis, sichtbarem State und Engine-Ergebnis.
- Antwort muss Unsicherheit ausdruecken koennen und darf Legalitaet nicht ueberschreiben.
- API-Key bleibt ausschliesslich auf dem Server.

### AUTH-001 - Privater Zugang

- Einfacher Playgroup-/Invite-Code statt Accounts.
- Rate-Limit, Rotation und serverseitige Speicherung beruecksichtigen.

### LOG-001 - Sichere Logs

- Strukturierte Ereignisse fuer Debugging und Tutor.
- Redaction fuer Passwoerter, Tokens und nicht fuer den Betrachter sichtbare Karten.
- Export zuerst; teilbarer Link ist optional.

### OPS-001 / OPS-002 - Deployment

- Compose fuer Web, API, SQLite-Volume, Relay und Forge-Room.
- Healthchecks, Restart-Verhalten, Backups und Upgrade-Runbook.
- Auf der Synology mit 6 GB RAM CPU/RAM unter realistischer Vier-Spieler-Last messen.

### TEST-001 - Milestone-1-E2E

- Ein echtes Deck importieren.
- Partie gegen drei Bots starten.
- Mehrere legale Aktionen ausfuehren.
- Speichern, Prozesse neu starten und laden.
- Ein Engine-Ereignis per Tutor erklaeren.

## Erledigte Tickets und Historie

### DONE-001 - Produktziel und MVP-Richtung festgelegt

- **Status:** `DONE`
- **Ergebnis:** Private Playgroup mit ca. 15 Personen, Desktop-Browser zuerst, ein Mensch gegen drei Bots, React/TypeScript, Node/TypeScript, SQLite, Docker Compose, Forge/Manabrew und optionaler GLM-Tutor.
- **Evidence:** `README.md`, `docs/wayfinding.md`.

### DONE-002 - Lokaler Protocol-Fixture-PoC

- **Status:** `DONE`
- **Ergebnis:** State wird gespeichert, `chooseAction` erzeugt UI-Highlights, `act` und `pass` werden korrekt geformt.
- **Evidence:** `packages/shared/fixtures/protocol-session.json`, `packages/shared/src/manabrew-protocol.ts`, `scripts/protocol-poc.mjs`.
- **Ausfuehren:** `node scripts/protocol-poc.mjs`.

### DONE-003 - Lokale echte Engine gestartet

- **Status:** `DONE`
- **Ergebnis:** Docker Desktop/WSL2, Manabrew Relay und Forge-backed Room liefen lokal; Relay-Healthcheck war erfolgreich.
- **Evidence:** `infra/manabrew-forge-room/compose.yml`, `docs/real-engine-poc.md`.

### DONE-004 - Eigener Client verbindet sich mit echter Engine

- **Status:** `DONE`
- **Ergebnis:** Auth, Room-Liste, Join, Deckwahl, Ready, Start, Resync, State und erster Prompt funktionieren ohne Manabrew-UI.
- **Evidence:** fruehe Summary-Captures in `captures/`, `scripts/capture-real-session.mjs`.

### DONE-005 - Drei Bots auf einem self-hosted node

- **Status:** `DONE`
- **Ergebnis:** Bot-Ursache gefunden. Separate `spawnBot`-Requests ersetzen die bestehende Bot-Gruppe; ein Batch mit `decks` startet bis zu `max_players - 1` Bots. Vier Spieler wurden real gestartet.
- **Evidence:** Manabrew-Quellcode auf Commit `a0a490a7bdd3e03ff7f5c0b02198a726536aecfc`, Capture `2026-09-16T14-26-10-157Z` und spaetere Captures.

### DONE-006 - Echter Pass-Loop

- **Status:** `DONE`
- **Ergebnis:** `diceRolled`, Mulligan und erster leerer `chooseAction` wurden beantwortet; `pass` wurde akzeptiert.
- **Evidence:** `captures/manabrew-real-session-2026-09-16T14-26-10-157Z.summary.json`.

### DONE-007 - Echter einfacher Act-Loop

- **Status:** `DONE`
- **Ergebnis:** Der Client passierte 26 leere Prioritaetsfenster, erhielt vier reale `Play Mountain`-Aktionen, sendete `act` fuer `prompt-action-0` und beobachtete dieselbe Karte danach auf dem Battlefield.
- **Details:** Zug 4, Schritt `main1`, vorher `hand`, danach `battlefield`, geaenderter Fingerprint, keine Fehler.
- **Evidence:** `captures/manabrew-real-session-2026-09-16T14-36-11-587Z.summary.json`.

### DONE-008 - Capture- und Secret-Hygiene

- **Status:** `DONE`
- **Ergebnis:** Authenticate-Passwort wird im Raw-Capture redigiert; `.env`, JSONL-Captures und temporaere Checkouts sind ignoriert.
- **Evidence:** `.gitignore`, `scripts/capture-real-session.mjs`.

### DONE-009 - Mehrstufiger Shock-Cast

- **Status:** `DONE`
- **Ergebnis:** Ein echter Nichtland-Zauber wurde mit Engine-Action, gegnerischer Zielwahl, Manafaehigkeit, Zahlung, Prioritaetspass und Aufloesung ausgefuehrt.
- **Details:** `Shock` ging von `hand` nach `graveyard`; `player-1` verlor zwei Leben; Stack danach leer; vier Spieler; keine Fehler.
- **Fehlerpfad:** Der erste Lauf zeigte, dass `pay(auto:true)` bei bereits vorhandenem Mana die Auto-Pay-Routine wiederholt. Korrekt ist `pay(auto:false)`. Ein Prompt-Loop-Guard wurde hinzugefuegt.
- **Evidence:** `captures/manabrew-real-session-2026-09-17T12-59-23-759Z.summary.json`.

### DONE-010 - Realer Protocol-Vertrag und Runtime-Parser

- **Status:** `DONE`
- **Ergebnis:** Die angenommenen Fixture-Typen wurden durch einen belegten Protocol-v5-Vertrag ersetzt. Transport, Engine-Envelopes, Prompt-Inputs und Antworten sind getrennt; ein Runtime-Parser schuetzt die spaetere API/UI-Grenze.
- **Regression:** Sieben sanitiserte Fixture-Nachrichten und alle 228 lokalen Nachrichten des erfolgreichen Captures wurden validiert. Der Test prueft `Shock` von Hand zu Friedhof, Ziel 40 -> 38, leeren Stack sowie die exakten Action-, Target- und Mana-Antworten.
- **Evidence:** `node scripts/protocol-contract-test.mjs` und die Artefakte aus `PROTO-005`.

## Entscheidungen, die vorerst gelten

- Eigene UI ueber die Protocol-Grenze; kein sofortiger Manabrew-Fork.
- Forge-backed Manabrew ist die erste Regelbasis.
- Engine bleibt Quelle fuer Regeln und Legalitaet.
- Bots und spaeter GLM duerfen nur Engine-gelieferte legale Optionen auswaehlen.
- GLM startet als Tutor/Explain-Schicht, nicht als Regelinstanz.
- Desktop-Browser zuerst; kein Mobile im MVP.
- Manueller Decklisten-/Linkimport vor automatischer mythic.tools-Synchronisierung.
- Privater Invite-Code vor vollstaendigem Accountsystem.
- Saves werden versioniert; Replay/Undo und langfristige Migration sind nicht Teil von Milestone 1.

## Bekannte Risiken

| Risiko | Auswirkung | Zugehoeriges Ticket |
| --- | --- | --- |
| Engine bietet keinen vollstaendigen Save/Resume-State | **Bestaetigt (SAVE-001):** Upstream-Node hat keinen Restore-Pfad. Pause/Fortsetzen braucht Replay-Journal (B) oder Fork/Upstream (C); bis dahin gilt Engine-Neustart als Partieverlust. | `SAVE-001`, `SAVE-002` |
| Protocol-DTOs weichen von der ersten lokalen Annahme ab | UI/API koennen bei realen Nachrichten brechen. | `PROTO-005` |
| Weitere Prompt-Familien sind noch nicht bewiesen | Modi, Mehrfachziele, Trigger-Reihenfolge oder Combat koennen den Client noch blockieren. | `PROTO-005`, `TEST-002` |
| Vier Forge-Spieler koennen die 6-GB-NAS ueberlasten | Deployment-Ziel waere nicht tragfaehig. | `OPS-002` |
| Reale Commander-Decks enthalten inkompatible Karten/Scripts | Spiele starten nicht oder laufen spaeter fest. | `DECK-002`, `BOT-002` |
| GLM kann plausible falsche Regeln erklaeren | Tutor verliert Vertrauen. | `GLM-001` |
| AGPL-/Forge-/Card-Art-Grenzen sind nicht final dokumentiert | Spaetere Verteilung koennte Umbau erfordern. | `LEGAL-001` |

## Weiterarbeiten auf einem neuen Rechner

Der folgende Ablauf verwendet den mit `BOOT-001` hergestellten Stand auf `origin/main`.

1. Repository klonen und in den Projektordner wechseln. Bei einem privaten Repository muss der GitHub-Zugriff auf dem Rechner bereits eingerichtet sein.

   ```powershell
   git clone https://github.com/FruechteBini/mtg_commander.git
   Set-Location mtg_commander
   ```

2. Dieses Dokument lesen und das oberste `NEXT`-Ticket waehlen.
3. Node.js und Docker Desktop beziehungsweise eine kompatible Docker-/Compose-Umgebung installieren.
4. `infra/manabrew-forge-room/.env.example` nach `infra/manabrew-forge-room/.env` kopieren und lokale Secrets setzen.
5. Engine starten:

   ```powershell
   & 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' compose `
     -f infra/manabrew-forge-room/compose.yml up -d
   ```

6. Relay pruefen:

   ```powershell
   Invoke-WebRequest -UseBasicParsing http://localhost:9444/health |
     Select-Object -ExpandProperty Content
   ```

7. Offline-PoC ausfuehren:

   ```powershell
   node scripts/protocol-poc.mjs
   ```

   Danach den Protocol-Vertrag und das reale Fixture pruefen:

   ```powershell
   node scripts/protocol-contract-test.mjs
   ```

8. Echten Capture ausfuehren:

   ```powershell
   node scripts/capture-real-session.mjs
   ```

9. Ergebnis als kleine Summary unter `captures/` dokumentieren; Raw-JSONL nicht committen.
10. Ticketstatus, Evidence, Ergebnis, naechsten Schritt und Risiken in dieser Datei aktualisieren.

## Milestone-1-Definition-of-Done

Milestone 1 ist erreicht, wenn alle folgenden Punkte gemeinsam funktionieren:

- Ein frischer Clone laesst sich dokumentiert starten.
- Ein echtes Playgroup-Commander-Deck kann importiert werden.
- Ein Mensch startet gegen drei einfache Bots.
- Die Hybrid-UI zeigt vier Spieler, relevante Zonen, Stack, Zug und Prioritaet.
- Der Mensch kann mehrere einfache und mindestens eine mehrstufige legale Aktion ausfuehren.
- Die Partie kann gespeichert, der Prozess neu gestartet und die Partie geladen werden.
- Ein reales Spielereignis kann auf Nachfrage serverseitig per GLM erklaert werden.
- Der komplette Stack laeuft per Docker Compose auf dem Zielsystem oder seine verbleibende Abweichung ist dokumentiert.
- Keine Secrets oder privaten Raw-Captures liegen im Repository.
