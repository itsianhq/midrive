import { count, eq, sql } from "drizzle-orm";
import { db, type DB, type Tx } from "@/db/drizzle";
import { node, settings, user } from "@/db/schema";

export type Settings = typeof settings.$inferSelect;

export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(settings).where(eq(settings.id, 1)))[0]!;
}

export async function updateSettings(patch: Partial<Omit<Settings, "id" | "updatedAt">>) {
  await getSettings();
  const [row] = await db.update(settings).set(patch).where(eq(settings.id, 1)).returning();
  return row!;
}

export async function countUsers() {
  const [row] = await db.select({ n: count() }).from(user);
  return row?.n ?? 0;
}

/** Bytes used by a user, including trashed files and in-flight uploads. */
export async function getStorageUsed(userId: string, exec: DB | Tx = db) {
  const [row] = await exec
    .select({ used: sql<string>`coalesce(sum(${node.size}), 0)` })
    .from(node)
    .where(eq(node.ownerId, userId));
  return Number(row?.used ?? 0);
}

/** Effective quota in bytes for a user, or null when unlimited. */
export async function getQuota(userId: string) {
  const [u] = await db.select({ quota: user.storageQuota }).from(user).where(eq(user.id, userId));
  if (u?.quota != null) return u.quota;
  return (await getSettings()).defaultQuota;
}

export async function getStorage(userId: string, exec: DB | Tx = db) {
  const [used, quota] = await Promise.all([getStorageUsed(userId, exec), getQuota(userId)]);
  return { used, quota };
}
