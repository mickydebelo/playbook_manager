import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assets, playbooks, users } from "./core";
import { exportFormat, jobStatus, jobType } from "./enums";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: jobType("type").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** Coarse progress for the wizard's loading states; replaced by `result` on success. */
    progress: jsonb("progress").$type<{ done: number; total: number; label: string }>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_status_run_after_idx").on(t.status, t.runAfter), index("jobs_target_idx").on(t.targetType, t.targetId)],
);

export const exports = pgTable(
  "exports",
  {
    id: id(),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    format: exportFormat("format").notNull(),
    includeSources: boolean("include_sources").notNull().default(false),
    includeComments: boolean("include_comments").notNull().default(false),
    status: jobStatus("status").notNull().default("queued"),
    artifactAssetId: uuid("artifact_asset_id").references(() => assets.id),
    jobId: uuid("job_id").references(() => jobs.id),
    requestedBy: uuid("requested_by").references(() => users.id),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("exports_playbook_idx").on(t.playbookId, t.createdAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_target_idx").on(t.targetType, t.targetId, t.createdAt)],
);
