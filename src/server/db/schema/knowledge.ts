import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { assets, customers, users } from "./core";
import { relevance, sourceCurrency, sourceStatus, sourceType } from "./enums";
import { sections } from "./playbook-content";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: id(),
    type: sourceType("type").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    ownerOrg: text("owner_org").notNull().default(""),
    year: smallint("year"),
    pageCount: integer("page_count"),
    url: text("url"),
    originalAssetId: uuid("original_asset_id").references(() => assets.id),
    status: sourceStatus("status").notNull().default("draft"),
    currency: sourceCurrency("currency").notNull().default("current"),
    isExternal: boolean("is_external").notNull().default(false),
    customerId: uuid("customer_id").references(() => customers.id),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("knowledge_sources_status_currency_idx").on(t.status, t.currency), index("knowledge_sources_tags_gin").using("gin", t.tags)],
);

export const sourcePages = pgTable(
  "source_pages",
  {
    id: id(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    previewAssetId: uuid("preview_asset_id").references(() => assets.id),
  },
  (t) => [index("source_pages_source_page_idx").on(t.sourceId, t.pageNo)],
);

export const sourceChunks = pgTable(
  "source_chunks",
  {
    id: id(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    pageNo: integer("page_no"),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    // Titan Text Embeddings v2 → 1024 dimensions (docs/APS_REST_API.md)
    embedding: vector("embedding", { dimensions: 1024 }),
  },
  (t) => [
    index("source_chunks_source_idx").on(t.sourceId, t.position),
    index("source_chunks_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const sectionSources = pgTable(
  "section_sources",
  {
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    relevance: relevance("relevance").notNull().default("medium"),
    score: real("score"),
    relevantFor: text("relevant_for").notNull().default(""),
    selected: boolean("selected").notNull().default(false),
    selectedBy: uuid("selected_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.sourceId] }), index("section_sources_source_idx").on(t.sourceId)],
);
