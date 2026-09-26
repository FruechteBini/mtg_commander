# SAVE-001: Save/Resume-Faehigkeit der Engine (Forschungsergebnis)

Datum: 2026-09-26. Status: **No-Go fuer echten Engine-Restore mit dem unveränderten Upstream-Node**; Alternativarchitektur A/B/C siehe unten.

Quellen: Clone `witchesofthehill/manabrew` @ `35868343c77132714e43b6a227092658f956296a` (2026-09-26), Inspektion des laufenden Containers `ghcr.io/witchesofthehill/manabrew-node:latest`, Relay-/Hub-Quellcode im selben Repo.

## Beweiskette

| # | Befund | Beleg (Repo-Pfad @ 3586834) |
| --- | --- | --- |
| 1 | Die FFI des Forge-Backends kennt nur `forge_initialize`, `forge_start_game`, `forge_submit_action`, `forge_get_prompt`, `forge_get_snapshot`, `forge_get_game_over`, `forge_end_game`, `forge_abort_game`, `forge_dump_heap`, `forge_gc_stats`. Kein save/load/restore-Entrypoint. | `forge-harness/native/forge/harness/ffi/ForgeNative.java` |
| 2 | Sessions leben nur im RAM (`ConcurrentHashMap` im Adapter); der Container hat keine Mounts/Volumes, Logs enthalten keine Save-/Checkpoint-Meldungen. Prozessneustart verliert die Partie. | `forge-harness/src/main/java/forge/harness/host/ManaBrewEngineAdapter.java`; `docker inspect` des forge-room-Containers |
| 3 | `restoreSnapshot` (Prompt-Output mit `checkpointId`) ist im Java-Forge-Backend explizit **nicht unterstützt**: `UnsupportedOperationException("unsupported canonical action type: restoreSnapshot")`. | `forge-harness/src/main/java/forge/harness/host/ManabrewProtocolAdapter.java:195` |
| 4 | Die Checkpoint-Mechanik (`record_checkpoint`, `SnapshotCreated`-Notification je Zugbeginn) gehört zur **eigenen Rust-Engine** (`manabrew-engine`), ist In-Memory und damit Zug-Undo, keine Persistenz. | `manabrew-rs/crates/manabrew-engine/src/game_loop.rs:684` |
| 5 | `forge_get_snapshot` liefert einen `GameView` (Spieleransicht, versteckte Zonen nur als `count`). Der `SnapshotExtractor` (normalisierter `StateSnapshot` fuer Parity-Tests) ist Diagnose-Export ohne Restore-Pfad. | `ForgeNative.java`; `forge-harness/.../SnapshotExtractor.java` |
| 6 | Relay: `ResumeRoom(resume_token)` + `reconnect_timeout_s` (Default 60 s) ist Client-Reconnect/Host-Retake, keine Spiel-Persistenz. Persistiert wird nur ChatHistory (100 Nachrichten/24 h); Partien erscheinen nur als `GameStarted`/`GameAborted`. | `manabrew-rs/crates/manabrew-relay-protocol/src/lib.rs` |
| 7 | Der Hub persistiert ausschliesslich Deck-Versionen (`SaveDeckVersionRequest`), keine Games. | `manabrew-rs/crates/manabrew-hub/src/dto.rs`, `routes.rs` |
| 8 | `StartGameRequest` enthaelt einen `seed` (Default 42, `CountingRandom`), aber der self-hosted-node waehlt den Seed fuer **interaktive Relay-Partien** per `rand::random()`; er wird weder konfiguriert (`SELF_HOSTED_NODE_SELF_PLAY_SEED` gilt nur Self-Play) noch in `GameStarted` veroeffentlicht. | `forge-harness/.../ManaBrewEngineAdapter.java:356,84`; `manabrew-rs/crates/self-hosted-node/src/engine_backend/java_backend.rs` (`run_hosted_engine_game_inner`: `rand::random()`) |
| 9 | Forge-intern existiert `GameSnapshot.restoreGameState` nur fuer Mana-Zahlungs-Undo innerhalb einer laufenden Session; die GUI-Save-Funktion von Card-Forge wird vom Harness nicht angebunden. | `forge-harness/.../ManaBrewInteractiveController.java:2289` |

**Fazit:** Es gibt keinen belastbaren Export-/Restore-Weg fuer den vollstaendigen versteckten Engine-Zustand im Upstream-Stack. Ein Minimaltest am unveränderten Stack ist damit gegenstandslos; das dokumentierte No-Go ersetzt ihn gemaess Ticket-Akzeptanz.

## Alternativarchitektur

- **Option A (Status quo, sofort verfuegbar):** Engine-/Node-Neustart markiert die Partie als unterbrochen; Neustart ueber Compose-Restart. Entspricht dem heutigen Verhalten und `architecture.md`-Ausfalltabelle.
- **Option B (Replay-Journal):** Die eigene API journalisiert die vollstaendige Startbedingung (Raum, Decks, Reihenfolge, Format) und **jede** `ClientToEngineEnvelope` (fromPlayer, promptId, action) in Reihenfolge. Restore = identisches `startGame` + geordnetes Abspielen des Journals. Voraussetzungen: (B1) Forge-Determinismus bei gleichem Seed + identischen Antworten ist zu beweisen (Proof laeuft auf Save-002/BOT-002-Infrastruktur auf), (B2) **Seed-Kontrolle**: aktuell `rand::random()` ohne Oeffenlegung -> Upstream-Feature/Issue noetig (Seed in `GameStarted` veroeffentlichen oder via Start-Request steuerbar machen), (B3) identische Engine-Version (im Save-Envelope versionieren).
- **Option C (Fork/Upstream, langfristig):** `forge-harness` um `forge_save_game`/`forge_load_game` erweitern (z. B. Anbindung der Card-Forge-Match-Serialisierung) und als Fork pflegen oder als Upstream-PR einbringen. Einzig echte Loesung fuer sofortiges Pause/Fortsetzen ohne Replay-Kosten.

**Empfehlung:** A jetzt, B als SAVE-002-MVP (Journal-Mitlauf kostet wenig und hilft auch Debugging/Logs), C als Backlog/Upstream-Issue; echte Produktentscheidung B vs. C offengelegt in `docs/project-tickets.md` (SAVE-002).

## Auswirkungen

- `SAVE-002`: Akzeptanz "Partie nach Prozessneustart fortsetzen" ist ohne Fork nicht erreichbar; Ziel wird versioniertes Journal + Unterbrechungsmarkierung (B) oder Fork-Arbeit (C).
- `API-001`: Tabellen `game`, `engine_version`, `prompt_response` (geordnet) und `game_abortion` modellieren; Journal als erstklassiges Artefakt.
- `architecture.md`: SQLite-Absatz und Ausfalltabelle aktualisiert (Engine-Neustart = Partieverlust, Restore nur via B/C).
