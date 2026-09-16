# Wayfinding: MTG-Commander

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
- Real-Capture-PoC bestaetigt: Ein eigener Node-Client kann dem Relay beitreten, ein Deck auswaehlen, ready setzen, ein echtes Forge-Spiel starten, `gameView` empfangen und einen ersten Prompt beantworten.
- Forge-backed Manabrew ist die wahrscheinliche Regelbasis.
- Echte Commander-Decks aus der Playgroup sollen genutzt werden.
- Solo-vs-Bots ist Teil des ersten Meilensteins: ein Mensch gegen drei Bots.
- Bots muessen am Anfang legal spielen, aber noch nicht strategisch stark sein.
- GLM wird zuerst als Tutor/Erklaer-Schicht vorgesehen; starke GLM-Bots kommen spaeter.
- Deckimport aus mythic.tools startet pragmatisch per Deck-Link oder exportierter Deckliste.
- Automatische mythic.tools-Synchronisierung ist nicht Teil des ersten Meilensteins.
- Pause/Fortsetzen wird sauber vorbereitet: versionierte Saves, aber MVP ohne Replay/History/Migration.
- UI: Hybrid statt voller Vier-Spieler-Tisch oder reinem Arena-Layout.
- Interaktion: assistiert by default, Manual Mode fuer erfahrene Spieler und komplexe Lines.
- Erklaerungen: auf Nachfrage, optionaler Anfaengermodus, komplett abschaltbar.
- Logs: automatisch im Hintergrund; optional teilbar per einfachem Link oder Export.
- Kein Mobile im MVP.
- Desktop-Browser zuerst; Tauri-Desktop-App ist ein Stretch Goal, falls der Zusatzaufwand klein bleibt.
- Stack: React/TypeScript, Node/TypeScript, SQLite, Docker Compose.
- Zugriff: privater Invite-/Playgroup-Code statt Accounts.

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

**Status:** Local stub done and first real engine capture done. See `docs/protocol-poc.md`, `docs/real-engine-poc.md`, `packages/shared/src/manabrew-protocol.ts`, `packages/shared/fixtures/protocol-session.json`, `scripts/protocol-poc.mjs`, and `scripts/capture-real-session.mjs`.

**Why it matters:** Diese Entscheidung bestimmt, ob wir eine saubere eigene App bauen koennen oder ob ein Fork realistischer ist.

**What to learn:**

- Wie stabil und vollstaendig ist das Manabrew-Protokoll fuer Commander?
- Welche State-Events, Prompts und Aktionen liefert es?
- Kann eine externe UI genug Informationen bekommen, um ein gutes Board zu rendern?
- Wie schwer ist es, Aktionen aus der UI zur Engine zurueckzugeben?

**Current answer:** Die Protokollgrenze sieht tragfaehig aus. Das Protokoll liefert volle `gameView`-Snapshots als autoritativen State und separate Prompts fuer Entscheidungen. Ein eigener Node-Client kann bereits ueber den Relay einer echten Forge-Session beitreten, eine Partie starten, `gameView` empfangen und einen ersten Prompt beantworten. `chooseAction` muss als naechstes gegen echte Daten bestaetigt werden.

**Next proof:** Einen echten `chooseAction`-Prompt mitschneiden und eine legale `act`- oder `pass`-Antwort gegen die echte Engine senden.

**Prepared artifact:** `infra/manabrew-forge-room/compose.yml` und `docs/real-engine-poc.md` beschreiben einen privaten Relay plus Forge-Room auf Docker Compose. Lokal erreichbar unter `ws://localhost:9443`, Health unter `http://localhost:9444/health`.

**Open risk:** Der Capture-Client fordert drei Bots an, aber der erste stabile Spielstart lief nur mit einem self-hosted-node-Bot. Fuer Solo gegen drei Bots muessen wir klaeren, ob ein Node mehrere Bots tragen kann, ob mehrere Node-Services noetig sind oder ob wir eigene Bot-Clients schreiben.

### Save/Load-Faehigkeit der Engine

**Question:** Koennen wir den vollstaendigen Spielzustand einer Commander-Partie speichern und spaeter fortsetzen?

**Type:** research/prototype

**Status:** Open.

**Why it matters:** Pause/Fortsetzen ist ein Kernwunsch und bei Magic deutlich komplexer als sichtbare Karten und Lebenspunkte.

**What to learn:**

- Ist der Engine-Zustand serialisierbar?
- Welche versteckten Informationen, Trigger, Prioritaets- und Stack-Zustaende muessen gespeichert werden?
- Gibt es bestehende Save-/Snapshot-Mechanismen in Manabrew oder Forge?
- Wie koennen versionierte Saves im MVP aussehen?

**Evidence:** Noch kein technischer Proof. Bisher nur Produktentscheidung: Save/Load soll sauber vorbereitet werden, aber Milestone 1 braucht noch keine Replay-/Migrationshistorie.

**Current answer:** Ungeklaert. Wir muessen pruefen, ob Manabrew/Forge einen serialisierbaren Spielzustand oder Snapshots anbietet. Falls nicht, muessen wir Save/Load ueber unseren Orchestrator oder einen kontrollierten Engine-Prozess loesen.

**Next proof:** In Manabrew/Forge nach Snapshot-, serialize-, save- oder resume-Funktionalitaet suchen und einen Minimaltest definieren: Spiel starten, State sichern, Prozess neu starten, State wiederherstellen.

**Open risk:** Wenn die Engine keinen vollstaendigen internen Zustand exportiert, wird robustes Pause/Fortsetzen deutlich groesser als nur `gameView` speichern.

### Bot-Steuerung

**Question:** Wie steuern wir Bots so, dass sie legal spielen und spaeter durch GLM verbessert werden koennen?

**Type:** grilling/prototype

**Status:** In progress.

**Why it matters:** Solo gegen drei Bots ist Teil des ersten Meilensteins.

**What to learn:**

- Gibt die Engine zu jedem Zeitpunkt eine Liste legaler Aktionen aus?
- Wie kann ein einfacher Bot daraus eine Aktion auswaehlen?
- Wie kann spaeter GLM denselben Aktionsraum nutzen?
- Wo liegen Latenz- und Kostenrisiken?

**Evidence:** Real-Capture-PoC konnte eine Partie mit einem self-hosted-node-Bot starten. Der Capture-Client fordert drei Bots an, der erste stabile Start hatte aber nur einen Bot in `player_order`.

**Current answer:** Legalitaet muss von der Engine kommen. Bots sollten nur aus Engine-gelieferten legalen Prompts/Aktionen waehlen. GLM darf spaeter eine Auswahl aus legalen Optionen bewerten, aber keine freien regeltechnischen Aktionen erfinden.

**Next proof:** Klaeren, wie drei Bots stabil in eine Partie kommen: ein Node mit mehreren Bots, mehrere self-hosted-node Services oder eigene Bot-Clients. Danach ersten echten `chooseAction`-Prompt fuer einen Bot beantworten.

**Open risk:** Drei Commander-Bots koennen mehr Infrastruktur brauchen als der einzelne eingebaute Node-Bot.

### Deckimport und Playgroup-Deckbibliothek

**Question:** Wie bekommen wir echte Commander-Decks aus mythic.tools pragmatisch in unsere App?

**Type:** research/task

**Status:** Open.

**Why it matters:** Der Produktkern ist: gegen die echten Decks von Freunden spielen.

**What to learn:**

- Welche Export- oder Linkformate bietet mythic.tools?
- Reicht Deck-Link/Textimport im MVP?
- Wie speichern wir Besitzer, Commander, Deckname, Quelle und Importzeitpunkt?
- Wie validieren wir Decklisten gegen Forge/Manabrew-Kartendaten?

**Evidence:** Produktentscheidung aus Wayfinding: mythic.tools ist gewuenscht, automatische Synchronisierung ist nicht Teil von Milestone 1.

**Current answer:** MVP startet pragmatisch mit Deck-Link oder exportierter Deckliste. Eine echte mythic.tools-Synchronisierung kommt spaeter, falls es eine stabile API oder ein verlaessliches Exportformat gibt.

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

**Next proof:** Aus einem echten `gameView`-Capture ein erstes statisches Boardmodell ableiten und daraus eine einfache Wireframe-/React-Ansicht bauen.

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
