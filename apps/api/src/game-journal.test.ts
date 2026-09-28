import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  GAME_JOURNAL_FORMAT_VERSION,
  createGameJournal,
  createGameJournalFromEnvironment,
} from "./game-journal.js";

const directory = mkdtempSync(join(tmpdir(), "mtg-game-journal-"));
const fixedNow = () => "2026-09-26T12:00:00.000Z";
const savedEnv: Record<string, string | undefined> = {};

function recordAt(records: Array<Record<string, unknown>>, index: number): Record<string, unknown> {
  const record = records[index];
  assert.ok(record, `expected journal record at index ${index}`);
  return record;
}

function readJournal(filePath: string): Array<Record<string, unknown>> {
  return readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

before(() => {
  for (const key of ["MANABREW_JOURNAL_DIR", "MANABREW_JOURNAL_DISABLE"]) {
    savedEnv[key] = process.env[key];
  }
});

after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});

test("journal records session, start condition and ordered responses as JSONL", () => {
  const filePath = join(directory, "game-journal-proof.jsonl");
  const journal = createGameJournal(filePath, fixedNow);

  journal.session({ relayUrl: "ws://localhost:9443", protocolVersion: 5, clientVersion: "0.1.0" });
  journal.gameStarted({ gameId: "game-1", roomId: "room-1", playerOrder: ["a", "b", "c", "d"] });
  journal.response({
    fromPlayer: "a",
    promptId: 7,
    actionType: "chooseAction",
    output: { type: "pass", exhaustStack: false },
  });
  journal.response({
    fromPlayer: "a",
    promptId: 8,
    actionType: "revealCards",
    output: { type: "revealCardsAcknowledged" },
  });
  journal.gameOver({ turn: 66 });
  journal.sessionEnd("close");

  const records = readJournal(filePath);
  const sessionRecord = recordAt(records, 0);
  const startRecord = recordAt(records, 1);
  const firstResponse = recordAt(records, 2);
  const secondResponse = recordAt(records, 3);
  const overRecord = recordAt(records, 4);
  const endRecord = recordAt(records, 5);

  assert.deepEqual(
    records.map((record) => record.record),
    ["session", "game-started", "response", "response", "game-over", "session-end"],
  );
  assert.deepEqual(
    records.map((record) => record.seq),
    [1, 2, 3, 4, 5, 6],
  );
  for (const record of records) {
    assert.equal(record.at, "2026-09-26T12:00:00.000Z");
  }

  assert.equal(sessionRecord.journalFormat, GAME_JOURNAL_FORMAT_VERSION);
  assert.equal(sessionRecord.relayUrl, "ws://localhost:9443");
  assert.deepEqual(startRecord.playerOrder, ["a", "b", "c", "d"]);

  assert.equal(firstResponse.gameId, "game-1");
  assert.equal(firstResponse.promptId, 7);
  assert.equal(firstResponse.actionType, "chooseAction");
  assert.deepEqual(firstResponse.output, { type: "pass", exhaustStack: false });
  assert.equal(secondResponse.gameId, "game-1");
  assert.deepEqual(secondResponse.output, { type: "revealCardsAcknowledged" });

  assert.equal(overRecord.turn, 66);
  assert.equal(endRecord.reason, "close");
});

test("journal inherits the last gameId so responses stay attributable", () => {
  const filePath = join(directory, "game-journal-attribution.jsonl");
  const journal = createGameJournal(filePath, fixedNow);

  journal.gameStarted({ gameId: "game-42", roomId: "room-1" });
  journal.response({ fromPlayer: "b", promptId: 1, actionType: "chooseAction", output: { type: "pass", exhaustStack: true } });
  journal.gameOver({});

  const records = readJournal(filePath);

  assert.equal(recordAt(records, 1).gameId, "game-42");
  assert.equal(recordAt(records, 2).gameId, "game-42");
});

test("journal degrades quietly when writes fail", () => {
  const blockedPath = join(directory, "blocked");
  mkdirSync(blockedPath); // directory where the journal file should live -> EISDIR

  const journal = createGameJournal(blockedPath, fixedNow);
  journal.session({ relayUrl: "ws://localhost:9443" }); // must not throw
  journal.sessionEnd("test"); // degraded: still must not throw
});

test("environment factory honours MANABREW_JOURNAL_DIR and the disable flag", () => {
  delete process.env.MANABREW_JOURNAL_DISABLE;
  process.env.MANABREW_JOURNAL_DIR = join(directory, "env");

  const journal = createGameJournalFromEnvironment(fixedNow);
  assert.ok(journal);
  assert.match(
    journal.filePath,
    new RegExp(`[\\\\/]env[\\\\/]game-journal-2026-09-26T12-00-00-000Z-${process.pid}\\.jsonl$`),
  );

  process.env.MANABREW_JOURNAL_DISABLE = "1";
  assert.equal(createGameJournalFromEnvironment(fixedNow), null);
});