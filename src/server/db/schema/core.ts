import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { industry, playbookStatus, sizeBand, templateKind, userRole } from "./enums";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    role: userRole("role").notNull().default("author"),
    idpSubject: text("idp_subject"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`), index("users_idp_subject_idx").on(t.idpSubject)],
);

export const assets = pgTable("assets", {
  id: id(),
  storageKey: text("storage_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: createdAt(),
});

export const customers = pgTable(
  "customers",
  {
    id: id(),
    name: text("name").notNull(),
    industry: industry("industry").notNull().default("other"),
    sizeBand: sizeBand("size_band").notNull().default("medium"),
    logoAssetId: uuid("logo_asset_id").references(() => assets.id),
    brandColor: char("brand_color", { length: 7 }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("customers_name_lower_uq").on(sql`lower(${t.name})`)],
);

export const templates = pgTable("templates", {
  id: id(),
  kind: templateKind("kind").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  outline: jsonb("outline").$type<{ title: string; sections: { title: string }[] }[]>().notNull().default([]),
  defaultFocusAreas: text("default_focus_areas").array().notNull().default(sql`'{}'::text[]`),
  usageCount: integer("usage_count").notNull().default(0),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  hasImage: boolean("has_image").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type TailorOptions = {
  terminology: boolean;
  industry: boolean;
  size: boolean;
  products: boolean;
  focus: boolean;
  executiveSummary: boolean;
};

export const playbooks = pgTable(
  "playbooks",
  {
    id: id(),
    title: text("title").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    status: playbookStatus("status").notNull().default("draft"),
    stage: smallint("stage").notNull().default(1),
    version: integer("version").notNull().default(1),
    createdFromTemplateId: uuid("created_from_template_id").references(() => templates.id),
    savedAsTemplateId: uuid("saved_as_template_id").references(() => templates.id),
    tailorOptions: jsonb("tailor_options")
      .$type<TailorOptions>()
      .notNull()
      .default({ terminology: true, industry: true, size: true, products: true, focus: true, executiveSummary: false }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("playbooks_owner_status_updated_idx").on(t.ownerId, t.status, t.updatedAt),
    index("playbooks_customer_idx").on(t.customerId),
  ],
);
