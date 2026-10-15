import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

// ---------------------------------------------------------------------------
// Better Auth (core + admin plugin fields)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  // Per-user storage quota in bytes. null = use the instance default.
  storageQuota: bigint("storage_quota", { mode: "number" }),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

export const nodeType = pgEnum("node_type", ["file", "folder"]);
export const nodeStatus = pgEnum("node_status", ["pending", "ready"]);
export const shareRole = pgEnum("share_role", ["viewer", "editor"]);

/** Files and folders live in one tree. A null parent means the owner's root. */
export const node = pgTable(
  "node",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => node.id, { onDelete: "cascade" }),
    type: nodeType("type").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    size: bigint("size", { mode: "number" }).default(0).notNull(),
    storageKey: text("storage_key"),
    thumbnailKey: text("thumbnail_key"),
    status: nodeStatus("status").default("ready").notNull(),
    // Set while a multipart upload is in flight
    uploadId: text("upload_id"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    // Set on the trashed node and every descendant trashed with it
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    // True only on the node the user actually trashed (what the Trash view lists)
    trashedRoot: boolean("trashed_root").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    index("node_owner_parent_idx").on(t.ownerId, t.parentId),
    index("node_parent_idx").on(t.parentId),
    index("node_owner_updated_idx").on(t.ownerId, t.updatedAt),
    check("node_not_own_parent", sql`${t.parentId} <> ${t.id}`),
  ],
);

export const star = pgTable(
  "star",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("star_user_node_idx").on(t.userId, t.nodeId)],
);

export const share = pgTable(
  "share",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: shareRole("role").notNull(),
    sharedById: text("shared_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("share_node_user_idx").on(t.nodeId, t.userId),
    index("share_user_idx").on(t.userId),
  ],
);

export const publicLink = pgTable(
  "public_link",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    nodeId: text("node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("public_link_node_idx").on(t.nodeId)],
);

/** Single-row table (id = 1) holding instance-wide settings. */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  // Closed by default; the first account (the admin) can always sign up
  signupEnabled: boolean("signup_enabled").default(false).notNull(),
  // Default per-user quota in bytes. null = unlimited.
  defaultQuota: bigint("default_quota", { mode: "number" }),
  trashRetentionDays: integer("trash_retention_days").default(30).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
