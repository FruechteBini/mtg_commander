# Wiederverwendbarer Manabrew-Client

`packages/manabrew-client` kapselt die serverseitige Verbindung zum Manabrew-Relay. Die API und das reale Capture-Skript verwenden damit dieselbe validierte Protokollgrenze.

## Verantwortungen

- Verbindung und Authentifizierung am Relay
- Raumliste, Beitritt, Deckauswahl und Ready-Status
- gemeinsamer Bot-Batch, Spielstart und Resync
- Prompt-Antworten sowie Verarbeitung von State, Delta, Prompt und Fehlern
- begrenztes exponentielles Reconnect-Verhalten
- Runtime-Validierung aller eingehenden Nachrichten mit dem Shared-Parser

Der Client entscheidet keine Magic-Regeln. Er transportiert ausschliesslich Relay-Nachrichten und Engine-gelieferte legale Aktionen.

## API-Anbindung

Die API aktiviert die Verbindung, sobald `MANABREW_RELAY_URL` und `MANABREW_SERVER_KEY` gesetzt sind. Ohne diese Variablen bleibt der Status bewusst `disabled`. `/api/status` liefert den aktuellen Verbindungsstatus, aber keine Zugangsdaten.

## Pruefungen

```powershell
npm test
npm run engine:smoke
```

Die automatischen Tests decken Nachrichtenformen, Zustandsverfolgung, ungueltige Nachrichten, Authentifizierungsfehler und Reconnects ab. `engine:smoke` authentifiziert sich zusaetzlich an einem laufenden lokalen Relay und prueft, ob der konfigurierte Raum in der Raumliste vorhanden ist. Dafuer muss der Compose-Stack laufen und `infra/manabrew-forge-room/.env` den lokalen Schluessel enthalten.
