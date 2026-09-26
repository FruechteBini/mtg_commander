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
- [docs/protocol-poc.md](docs/protocol-poc.md): Protocol-Grenze, Nachrichtenformen und Capture-Ergebnisse.
- [docs/real-engine-poc.md](docs/real-engine-poc.md): lokales Docker-/Forge-Runbook.

Repository-Status: Die Git-Baseline ist hergestellt. Branch `main` verfolgt `origin/main` unter `https://github.com/FruechteBini/mtg_commander.git`; `BOOT-001` ist abgeschlossen und der dokumentierte Stand kann auf einem anderen Rechner geklont werden.

Der erste lokale Protokoll-PoC liegt in [docs/protocol-poc.md](docs/protocol-poc.md). Er kann ohne Dependencies direkt mit Node ausgefuehrt werden:

```sh
node scripts/protocol-poc.mjs
```

Der reale Protocol-v5-Vertrag und der sanitiserte Shock-Regressionsloop werden ebenfalls ohne Dependencies geprueft:

```sh
node scripts/protocol-contract-test.mjs
```

Der Test validiert Relay- und Engine-Envelopes, State, Ziel-/Mana-Prompts, die erzeugten Antworten und den abschliessenden Zustandswechsel. Liegt der ignorierte lokale Raw-Capture vor, werden auch alle seine Nachrichten gestreamt und validiert. Bei einer normalen Node-Installation steht derselbe Lauf auch als `npm run protocol:test` bereit; in der aktuellen Codex-Runtime ist nur der direkte Node-Befehl verfuegbar.

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
