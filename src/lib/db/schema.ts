import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/** Console-originated runs (launchers, gaming mode) + cached externals. */
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  host: text("host").notNull().default("local"),
  ts: integer("ts").notNull(),
  trigger: text("trigger").notNull(),
  durMs: integer("dur_ms"),
  items: text("items"),
  result: text("result").notNull(), // ok | warn | err | run
  source: text("source").notNull(), // console | n8n | odysseus
  detail: text("detail"),
});

/** Review-queue items owned by the console. External ones are fetched live. */
export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  source: text("source").notNull(),
  externalId: text("external_id"),
  title: text("title").notNull(),
  snippet: text("snippet").notNull(),
  body: text("body"),
  confidence: real("confidence"),
  ts: integer("ts").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  resolvedTs: integer("resolved_ts"),
});

/** Every state-changing console action. */
export const audit = sqliteTable("audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: integer("ts").notNull(),
  actor: text("actor").notNull().default("ryan"),
  action: text("action").notNull(),
  target: text("target"),
  detail: text("detail"),
});

/** Small key-value store: workflow enable/autonomy overrides, gaming-mode state. */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
