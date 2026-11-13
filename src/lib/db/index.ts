import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { appRoot } from "../config";

export type DB = BetterSQLite3Database<typeof schema>;

const g = globalThis as unknown as { __rkDb?: DB };

const BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, host TEXT NOT NULL DEFAULT 'local',
  ts INTEGER NOT NULL, trigger TEXT NOT NULL, dur_ms INTEGER, items TEXT,
  result TEXT NOT NULL, source TEXT NOT NULL, detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_ts ON runs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_runs_wf ON runs(workflow_id, ts DESC);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, source TEXT NOT NULL, external_id TEXT,
  title TEXT NOT NULL, snippet TEXT NOT NULL, body TEXT, confidence REAL,
  ts INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', resolved_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, ts DESC);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL,
  actor TEXT NOT NULL DEFAULT 'ryan', action TEXT NOT NULL, target TEXT, detail TEXT
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function getDb(): DB {
  if (g.__rkDb) return g.__rkDb;
  const dir = path.join(appRoot(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const sqlite = new Database(path.join(dir, "console.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(BOOTSTRAP);
  g.__rkDb = drizzle(sqlite, { schema });
  return g.__rkDb;
}
