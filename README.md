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

Die aktuelle Wayfinder-Map liegt in [docs/wayfinding.md](docs/wayfinding.md).

Der erste lokale Protokoll-PoC liegt in [docs/protocol-poc.md](docs/protocol-poc.md). Er kann ohne Dependencies direkt mit Node ausgefuehrt werden:

```sh
node scripts/protocol-poc.mjs
```

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

Der erste saubere Real-Capture bestaetigt: ein eigener Node-Client kann dem Relay beitreten, ein Deck setzen, eine Forge-Partie starten, `gameView` empfangen und einen ersten Prompt beantworten.
