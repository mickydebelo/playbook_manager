import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  char,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { assets, playbooks, users } from "./core";
import { briefSourceKind, collabRole, coverage, messageRole, versionReason } from "./enums";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const briefs = pgTable("briefs", {
  playbookId: uuid("playbook_id")
    .primaryKey()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  objective: text("objective").notNull().default(""),
  focusAreas: text("focus_areas").array().notNull().default(sql`'{}'::text[]`),
  additionalContext: text("additional_context").notNull().default(""),
  logoAssetId: uuid("logo_asset_id").references(() => assets.id),
  brandColor: char("brand_color", { length: 7 }),
  updatedAt: updatedAt(),
});

export const briefSources = pgTable(
  "brief_sources",
  {
    id: id(),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    kind: briefSourceKind("kind").notNull().default("link"),
    title: text("title").notNull(),
    url: text("url").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("brief_sources_playbook_idx").on(t.playbookId, t.position)],
);

export const chapters = pgTable(
  "chapters",
  {
    id: id(),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("chapters_playbook_position_idx").on(t.playbookId, t.position)],
);

export const sections = pgTable(
  "sections",
  {
    id: id(),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    parentSectionId: uuid("parent_section_id").references((): AnyPgColumn => sections.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    contentMd: text("content_md").notNull().default(""),
    wordCount: integer("word_count").notNull().default(0),
    contentSavedAt: timestamp("content_saved_at", { withTimezone: true }),
    coverage: coverage("coverage").notNull().default("none"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sections_playbook_chapter_position_idx").on(t.playbookId, t.chapterId, t.position)],
);

export const sectionVersions = pgTable(
  "section_versions",
  {
    id: id(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    contentMd: text("content_md").notNull(),
    reason: versionReason("reason").notNull().default("edit"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("section_versions_section_idx").on(t.sectionId, t.createdAt)],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("comments_section_idx").on(t.sectionId, t.createdAt)],
);

export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: id(),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("assistant_messages_section_idx").on(t.sectionId, t.createdAt)],
);

export const collaborators = pgTable(
  "collaborators",
  {
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: collabRole("role").notNull().default("reviewer"),
    invitedBy: uuid("invited_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.playbookId, t.userId] })],
);

export const shareLinks = pgTable("share_links", {
  id: id(),
  playbookId: uuid("playbook_id")
    .notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
