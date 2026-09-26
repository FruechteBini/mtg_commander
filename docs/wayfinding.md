# Wayfinding: MTG-Commander

> Zentrale Arbeits- und Ticketliste: `docs/project-tickets.md`. Dieses Dokument behaelt die Produktentscheidungen, Forschungsfragen und technischen Begruendungen.

## Destination

Ein privater Commander-Prototyp fuer die Playgroup: Ein Mensch kann auf einem Desktop-PC gegen drei Bots mit echten Commander-Decks aus der Gruppe spielen. Die App nutzt eine vorhandene Regel-Engine, bietet eine eigene Hybrid-UI, kann Spielstaende speichern/laden und kann Spielereignisse optional per GLM erklaeren.

## Notes

- Wayfinder-Modus: Planung zuerst, nicht direkt bauen.
- Produktziel zuerst privat fuer ca. 15 Leute.
- Einige Spieler sind Anfaenger; Erklaerbarkeit ist ein echtes Produktziel.
- Erste technische Richtung: eigene UI gegen Manabrew-Protokoll pruefen, nicht sofort forken.
- Engine-Basis: Forge-backed Manabrew als Ausgangspunkt.
- GLM wird serverseitig genutzt; API-Key darf nicht in den Client.
- GLM hat zwei getrennte Rollen:
  - Bot-Decision AI: waehlt aus legalen Aktionen.
  - Tutor/Explain AI: erklaert, was passiert ist und warum.
- Deployment-Ziel: Docker Compose auf Synology NAS mit 6 GB RAM.
- UI-Ziel: Desktop-PC, Hybrid-Commander-UI, assistiert wie Magic Arena mit Manual Mode.

## Decisions so far

- Privater Prototyp statt oeffentliches Produkt.
- Erster technischer Weg: eigene UI gegen das Manabrew-Protokoll als Proof of Concept.
- Kein sofortiger Manabrew-Fork, solange die Protokoll-Anbindung tragfaehig wirkt.
- Protokoll-PoC 0 bestaetigt lokal: State + `chooseAction` reichen fuer einen ersten UI-Loop aus Highlighting und `response`.
- Real-Engine-PoC laeuft lokal mit Docker Desktop/WSL2: Relay healthy, Forge-Backend initialisiert, Raum `MTG-Commander PoC` erstellt, Bot mit 100-Karten-Deck beigetreten.
- Real-Capture-PoC bestaetigt: Ein eigener Node-Client kann dem Relay beitreten, drei Bots in einem Batch anfordern, ein echtes Vier-Spieler-Forge-Spiel starten, `gameView` empfangen und `diceRolled`, Mulligan sowie `chooseAction` beantworten.
- Real-`act`-PoC bestaetigt: Nach legalen Pass-Antworten auf leere Prioritaetsfenster hat der Client eine Engine-gelieferte `Play Mountain`-Aktion gesendet; dieselbe Spielerperspektive zeigte die Karte danach von der Hand auf dem Battlefield.
- Forge-backed Manabrew ist die wahrscheinliche Regelbasis.
- Echte Commander-Decks aus der Playgroup sollen genutzt werden.
- Solo-vs-Bots ist Teil des ersten Meilensteins: ein Mensch gegen drei Bots.
- Bots muessen am Anfang legal spielen, aber noch nicht strategisch stark sein.
- GLM wird zuerst als Tutor/Erklaer-Schicht vorgesehen; starke GLM-Bots kommen spaeter.
- Deckimport aus mythic.tools startet pragmatisch per Deck-Link oder exportierter Deckliste.
- Automatische mythic.tools-Synchronisierung ist nicht Teil des ersten Meilensteins.
- Pause/Fortsetzen: `SAVE-001` ergab ein Engine-No-Go; MVP plant daher Replay-Journal/Unterbrechungsmarkierung statt echtem Engine-Save (`docs/save-resume-research.md`).
- UI: Hybrid statt voller Vier-Spieler-Tisch oder reinem Arena-Layout.
- Interaktion: assistiert by default, Manual Mode fuer erfahrene Spieler und komplexe Lines.
- Erklaerungen: auf Nachfrage, optionaler Anfaengermodus, komplett abschaltbar.
- Logs: automatisch im Hintergrund; optional teilbar per einfachem Link oder Export.
- Kein Mobile im MVP.
- Desktop-Browser zuerst; Tauri-Desktop-App ist ein Stretch Goal, falls der Zusatzaufwand klein bleibt.
- Stack: React/TypeScript, Node/TypeScript, SQLite, Docker Compose.
- Zugriff: privater Invite-/Playgroup-Code statt Accounts.
- Prozessgrenze fuer Milestone 1: Browser -> eigene Node-API/WebSocket-Schicht -> interner Manabrew-Relay -> separater Forge-backed node.
- Die eigene API ist Relay-Client und Spiel-Orchestrator; Browser und React-App erhalten keine Relay-, Raum- oder GLM-Secrets.
- SQLite, Deckbibliothek, Saves und strukturierte Logs bleiben serverseitig; sichtbares `gameView` gilt nicht als vollstaendiges Savegame.
- Relay und Forge bleiben getrennte Drittanbieterprozesse. Die eigene Protokollimplementierung folgt der CC-BY-4.0-Spezifikation; AGPL-/GPL- und Asset-Fragen werden entlang dieser Grenze dokumentiert.
- Reconnect ist nach Ausfallstufe getrennt: Browser-Reconnect nutzt API-Cache, API/Relay brauchen Retake/Resync-Proofs, Engine-Neustart markiert die Partie als unterbrochen (`SAVE-001`-No-Go; Restore-Strategie in `docs/save-resume-research.md`).
- `APP-001` ist umgesetzt: npm-Workspace mit React/Vite-Web-App, Node/TypeScript-API und Shared-Package; Browserzugriff auf die API erfolgt lokal ueber `/api`, beide Dienste besitzen Healthchecks.
- `ENGINE-001` ist umgesetzt: Capture-Skript und API nutzen denselben serverseitigen Manabrew-Client fuer Relay-, Raum-, Spiel-, Prompt- und Reconnect-Ablauf.

## Frontier Tickets

Arbeitsregel: Jedes Wayfinder-/Frontier-Ticket wird beim Bearbeiten direkt hier mitdokumentiert. Pro Ticket halten wir mindestens fest:

- `Status`: offen, in Arbeit, blockiert, beantwortet oder naechster Proof definiert.
- `Evidence`: welche Datei, welcher Capture, welcher Testlauf oder welche Quelle den Stand belegt.
- `Current answer`: was wir aktuell glauben oder entschieden haben.
- `Next proof`: was als naechstes konkret ausprobiert wird.
- `Open risk`: was noch unsicher ist.

### Manabrew-Protokoll-PoC

**Question:** Koennen wir eine eigene UI sinnvoll an Manabrew/Forge anbinden, ohne Manabrew komplett zu forken?

**Type:** research/prototype

**Status:** Beantwortet fuer den belegten MVP-Loop; realer DTO-Abgleich und Runtime-Parser sind abgeschlossen. See `docs/protocol-poc.md`, `docs/real-engine-poc.md`, `packages/shared/src/manabrew-protocol.ts`, `packages/shared/src/manabrew-protocol-parser.mjs`, `packages/shared/fixtures/protocol-session.json`, `scripts/protocol-contract-test.mjs`, `scripts/capture-real-session.mjs`, and `captures/manabrew-real-session-2026-09-17T12-59-23-759Z.summary.json`.

**Why it matters:** Diese Entscheidung bestimmt, ob wir eine saubere eigene App bauen koennen oder ob ein Fork realistischer ist.

**What to learn:**

- Wie stabil und vollstaendig ist das Manabrew-Protokoll fuer Commander?
- Welche State-Events, Prompts und Aktionen liefert es?
- Kann eine externe UI genug Informationen bekommen, um ein gutes Board zu rendern?
- Wie schwer ist es, Aktionen aus der UI zur Engine zurueckzugeben?

**Current answer:** Die Protokollgrenze ist fuer einen echten mehrstufigen UI-Aktionsloop tragfaehig. Der Protocol-v5-Vertrag trennt Relay-`type` von Engine-`kind`, bildet den Shock-Loop inklusive Ziel und Mana ab und wird an der externen Grenze zur Laufzeit validiert. Der Offline-Test validierte sieben sanitiserte Fixture-Nachrichten und alle 228 Nachrichten des lokalen erfolgreichen Captures. `stateDelta`, `error` und `fatal` wurden im erfolgreichen Lauf nicht real emittiert und bleiben als noch nicht capture-bewiesene Vertraege markiert.

**Next proof:** Erfuellt – `UI-001` normalisiert echte `gameView`-States deterministisch in das versionierte UI-Modell (`docs/ui-model.md`), und `UI-002` rendert das Modell als ersten statischen Board-Slice in der Web-App.

**Execution log (2026-09-16):** Der Capture wurde so erweitert, dass leere `chooseAction`-Prompts weiter mit `pass` beantwortet werden. Erfolg wird nur bei einer Engine-gelieferten `actionId` und einem Zustandswechsel derselben Spielerperspektive gemeldet. Der Lauf `manabrew-real-session-2026-09-16T14-36-11-587Z` bestand dieses Kriterium: `Play Mountain`, `hand` -> `battlefield`, gleicher Zug und Schritt, geaenderter Fingerprint, keine Fehler.

**Execution log (2026-09-17):** Der Lauf `manabrew-real-session-2026-09-17T12-59-23-759Z` bestand den mehrstufigen Proof. Prompt-Kette: `chooseAction:act` -> `chooseBoardTargets:boardTargets` -> `payManaCost:act` -> `payManaCost:pay(auto:false)` -> `chooseAction:pass`; Ergebnis: `Shock` im Friedhof, Stack leer, Ziel 40 -> 38 Leben. Der erste Versuch zeigte eine Schleife mit `auto:true`; der Client nutzt jetzt die korrekte Bestaetigung und einen Loop-Guard.

**Execution log (2026-09-17, PROTO-005):** Das synthetische Fixture wurde durch eine sanitiserte reale State-/Prompt-Folge ersetzt. TypeScript-Vertrag, Runtime-Parser und Regressionstest wurden ergaenzt; `node scripts/protocol-contract-test.mjs` bestaetigte das Fixture sowie 228 lokale Raw-Capture-Nachrichten.

**Prepared artifact:** `infra/manabrew-forge-room/compose.yml` und `docs/real-engine-poc.md` beschreiben einen privaten Relay plus Forge-Room auf Docker Compose. Lokal erreichbar unter `ws://localhost:9443`, Health unter `http://localhost:9444/health`.

**Open risk:** Mana und Einzelziel sind bestaetigt; Moduswahl, Mehrfachziele, Trigger-Reihenfolge und Combat-Prompts sind noch nicht Ende-zu-Ende bewiesen.

### Save/Load-Faehigkeit der Engine

**Question:** Koennen wir den vollstaendigen Spielzustand einer Commander-Partie speichern und spaeter fortsetzen?

**Type:** research/prototype

**Status:** Beantwortet (2026-09-26). See `docs/save-resume-research.md` fuer die vollstaendige Beweiskette gegen den Manabrew-Clone `witchesofthehill/manabrew` @ `35868343c77132714e43b6a227092658f956296a` sowie `docker inspect`/`docker logs` des forge-room-Containers.

**Why it matters:** Pause/Fortsetzen ist ein Kernwunsch und bei Magic deutlich komplexer als sichtbare Karten und Lebenspunkte.

**What to learn:**

- Ist der Engine-Zustand serialisierbar?
- Welche versteckten Informationen, Trigger, Prioritaets- und Stack-Zustaende muessen gespeichert werden?
- Gibt es bestehende Save-/Snapshot-Mechanismen in Manabrew oder Forge?
- Wie koennen versionierte Saves im MVP aussehen?

**Current answer:** Nein - der Upstream-Stack bietet keinen vollstaendigen Save/Restore. FFI ohne Save-Entrypoint, Sessions nur im RAM, `restoreSnapshot` im Java-Backend unsupported, Relay persistiert keine Games, Partie-Seed per `rand::random()` nicht steuerbar. Alternativen: A Unterbrechungsmarkierung (Status quo), B Replay-Journal (braucht Determinismus-Beweis + Upstream-Seed-Kontrolle), C Fork/Upstream mit `forge_save_game`/`forge_load_game`.

**Next proof:** SAVE-002-Proof nach Produktentscheidung B vs. C: fuer B ein Replay-Minimaltest (identische Startbedingung + geordnete Prompt-Antworten reproduzieren denselben Spielzustand), fuer C ein forge-harness-Fork-Prototyp.

**Open risk:** Forge-Determinismus ueber lange Commander-Partien ist unbewiesen; Seed-Kontrolle erfordert ein Upstream-Feature.

### Bot-Steuerung

**Question:** Wie steuern wir Bots so, dass sie legal spielen und spaeter durch GLM verbessert werden koennen?

**Type:** grilling/prototype

**Status:** Bot-Topologie beantwortet; Spielstaerke und Langlaufverhalten bleiben in Arbeit.

**Why it matters:** Solo gegen drei Bots ist Teil des ersten Meilensteins.

**What to learn:**

- Gibt die Engine zu jedem Zeitpunkt eine Liste legaler Aktionen aus?
- Wie kann ein einfacher Bot daraus eine Aktion auswaehlen?
- Wie kann spaeter GLM denselben Aktionsraum nutzen?
- Wo liegen Latenz- und Kostenrisiken?

**Evidence:** Manabrew-Quellcode auf Commit `a0a490a7bdd3e03ff7f5c0b02198a726536aecfc` zeigt einen Batch-`spawnBot` mit `decks`; jeder neue Request ersetzt die bestehende Bot-Gruppe. Der Real-Capture `captures/manabrew-real-session-2026-09-17T12-59-23-759Z.summary.json` startete mit vier Eintraegen in `player_order` und loeste einen gezielten `Shock` inklusive Mana ohne Fehler auf.

**Current answer:** Ein einzelner self-hosted-node Service kann drei Bot-Tasks fuer einen Commander-Pod tragen; mehrere Node-Services oder eigene Bot-Clients sind fuer die reine Sitzanzahl nicht noetig. Die Anfrage muss als ein `spawnBot`-Payload mit drei Decks erfolgen. Legalitaet bleibt Engine-gesteuert; GLM darf spaeter nur Engine-gelieferte Optionen bewerten.

**Next proof:** Den Vier-Spieler-Pod mit einem realistischen Playgroup-Deck ueber mehrere Zuege und groessere Boardstates laufen lassen.

**Open risk:** Vier laufende Forge-Spieler mit realistischen Decks und grossen Boardstates koennen auf der 6-GB-NAS noch Speicher- oder Laufzeitprobleme zeigen.

### Deckimport und Playgroup-Deckbibliothek

**Question:** Wie bekommen wir echte Commander-Decks aus mythic.tools pragmatisch in unsere App?

**Type:** research/task

**Status:** Proven - neutraler Textimport (`DECK-001`) und erster echter Playgroup-Import mit Forge-Start (`DECK-002`) sind bewiesen.

**Why it matters:** Der Produktkern ist: gegen die echten Decks von Freunden spielen.

**What to learn:**

- Welche Export- oder Linkformate bietet mythic.tools?
- Reicht Deck-Link/Textimport im MVP?
- Wie speichern wir Besitzer, Commander, Deckname, Quelle und Importzeitpunkt?
- Wie validieren wir Decklisten gegen Forge/Manabrew-Kartendaten?

**Evidence:** Produktentscheidung aus Wayfinding: mythic.tools ist gewuenscht, automatische Synchronisierung ist nicht Teil von Milestone 1. `DECK-001` abgeschlossen: `packages/shared/src/deck-list.ts` parst, validiert und konvertiert typische Textlisten (Regressionstest `npm run deck:test`). `DECK-002` abgeschlossen (2026-09-26): Das echte Playgroup-Deck `Dina Sacrifice` (Commander `Dina, Essence Brewer`) wurde importiert und startete in einer echten Vier-Spieler-Partie auf Forge (`captures/deck-forge-start-2026-09-26T12-41-15-366Z.summary.json`).

**Current answer:** MVP startet pragmatisch mit Deck-Link oder exportierter Deckliste; der erste echte Beweis lief ueber eine exportierte Textliste ohne Commander-Marker (Commander wurde als Meta-Angabe uebergeben). Eine echte mythic.tools-Synchronisierung kommt spaeter, falls es eine stabile API oder ein verlaessliches Exportformat gibt. Der neutrale Textimport parst Sektionen, `*CMDR*`-Marker, Anzahl und Printing, prueft die 100-Karten-Regel (1-2 Commander, Singleton ausser Basiscards) und konvertiert deterministisch in das capture-bewaehrte Manabrew-Deckformat; Forge loest auch neue Karten wie `Dina, Essence Brewer` (Set `SOC`) korrekt per Namen auf.

**Next proof:** Ein echtes Beispieldeck aus mythic.tools exportieren oder verlinken und in das Deckformat fuer Manabrew/Forge umwandeln.

**Open risk:** Falls mythic.tools keine stabile Export-/API-Oberflaeche bietet, brauchen wir manuelle Importe oder einen neutralen Decklistenimport.

### Hybrid-UI-Prototyp

**Question:** Wie sieht ein lesbares Commander-Board fuer einen Menschen gegen drei Bots aus?

**Type:** prototype

**Status:** Open.

**Why it matters:** Commander erzeugt schnell sehr viel Board-State; die UI muss Anfaenger fuehren und erfahrene Spieler nicht bremsen.

**What to learn:**

- Wie gross ist der eigene Spielerbereich?
- Wie kompakt duerfen Gegner-Panels sein?
- Wie werden Trigger, Stack, Angriffe, Blocks und verfuegbare Aktionen hervorgehoben?
- Wie funktioniert Manual Mode?

**Evidence:** Produktentscheidung aus Wayfinding: Hybrid-Commander-UI, eigener Bereich gross, Gegner kompakt/aufklappbar, assistiert wie Arena mit Manual Mode.

**Current answer:** Die UI soll nicht reiner Vier-Spieler-Tisch und nicht reines Arena-Layout werden, sondern eine Hybridansicht fuer Solo-vs-Bots auf Desktop-PC.

**Next proof:** Erfuellt – `UI-002` rendert das UI-Modell als ersten React-Board-Slice (grosser eigener Bereich, drei kompakte aufklappbare Gegner-Panels, Stack sichtbar, Capture-Loader fuer echte States). Offen ist die Interaktion: Prompt-Antworten, Highlighting legaler Aktionen und Live-States.

**Open risk:** Commander-Boardstates koennen sehr gross werden; Lesbarkeit und Performance muessen frueh mit echten Boardstates geprueft werden.

### GLM-Tutor

**Question:** Wie erklaeren wir Spielereignisse per GLM, ohne dass die KI Regeln halluziniert?

**Type:** grilling/prototype

**Status:** Open.

**Why it matters:** Anfaenger sollen verstehen, was passiert, aber Legalitaet und Regeln muessen aus der Engine kommen.

**What to learn:**

- Welcher strukturierte Engine-Kontext wird an GLM gesendet?
- Wie begrenzen wir GLM auf Erklaeren statt Regeln erfinden?
- Wie sieht ein Erklaerungs-UI aus?
- Wann wird automatisch erklaert, wann nur auf Nachfrage?

**Evidence:** Produktentscheidung aus Wayfinding: GLM serverseitig, API-Key nie im Client, Tutor/Explain AI getrennt von Bot-Decision AI.

**Current answer:** GLM soll zuerst erklaeren, nicht entscheiden. Die Engine bleibt Quelle fuer Legalitaet und Regeln; GLM bekommt strukturierte Ereignisse, sichtbaren Kontext und klare Grenzen.

**Next proof:** Ein erstes Prompt-Schema fuer ein reales Engine-Ereignis bauen und mit einem anonymisierten Beispiel testen.

**Open risk:** Ohne stark begrenzten Kontext koennte GLM plausibel klingende, aber falsche Regelerklaerungen erzeugen.

## Not Yet Specified

- Wie genau Manabrew-Protokoll und Forge-Engine lokal oder serverseitig gestartet werden.
- Ob der Engine-Prozess separat vom API-Service laeuft.
- Wie Multiplayer mit echten Menschen spaeter umgesetzt wird.
- Wie teilbare Logs technisch aussehen.
- Wie gut GLM strategisch fuer Bot-Entscheidungen ist.
- Ob Tauri direkt mitgepackt wird oder erst nach dem Web-Prototyp.
- Welche Testdecks als erste Validierungsdecks verwendet werden.

## Out of Scope for Milestone 1

- Mobile UI.
- Oeffentliche Accounts.
- Matchmaking.
- Monetarisierung.
- Perfekte Arena-Animationen.
- Automatische mythic.tools-Synchronisierung.
- Starke GLM-Bot-Strategie.
- Replay-/Undo-History.
- Oeffentliche Multiplayer-Lobbys.
- Voll robustes Save-Migrationssystem fuer beliebige spaetere Engine-Versionen.

## Milestone 1

Ein Mensch startet eine Commander-Partie gegen drei einfache Bots mit importierten echten Decks, sieht eine Hybrid-Oberflaeche, macht einige legale Aktionen, speichert und laedt die Partie erneut und ruft optional eine GLM-Erklaerung zu einem Ereignis ab.
