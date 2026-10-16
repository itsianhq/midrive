import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { node } from "@/db/schema";
import { purgeNodes } from "@/lib/drive";
import { deleteObjects, listKeys, thumbnailKey } from "@/lib/s3";
import { getSettings } from "@/lib/settings";
import { cleanupStaleUploads } from "@/routes/uploads";

async function purgeOldTrash() {
  const { trashRetentionDays } = await getSettings();
  const cutoff = new Date(Date.now() - trashRetentionDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: node.id })
    .from(node)
    .where(and(eq(node.trashedRoot, true), lt(node.trashedAt, cutoff)));
  await purgeNodes(rows.map((r) => r.id));
  return rows.length;
}

/**
 * Delete stored objects that no node points to, e.g. written through a still-valid
 * upload URL after the upload was aborted, or left behind by a failed delete.
 * A node's row always exists before its upload URLs are issued, so no grace period is needed.
 */
export async function sweepOrphanObjects() {
  let removed = 0;
  for (const prefix of ["files/", "thumbnails/"]) {
    for await (const keys of listKeys(prefix)) {
      // files/<owner>/<id> and thumbnails/<owner>/<id>.webp
      const ids = keys.map((k) => k.split("/")[2]?.replace(/\.webp$/, "") ?? "");
      const rows = ids.length
        ? await db
            .select({
              id: node.id,
              ownerId: node.ownerId,
              status: node.status,
              storageKey: node.storageKey,
              thumbnailKey: node.thumbnailKey,
            })
            .from(node)
            .where(inArray(node.id, ids))
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const orphans = keys.filter((key, i) => {
        const row = byId.get(ids[i]!);
        if (!row) return true;
        if (prefix === "files/") return key !== row.storageKey;
        // A pending upload's thumbnail isn't linked to the row until completion
        return key !== row.thumbnailKey && !(row.status === "pending" && key === thumbnailKey(row.ownerId, row.id));
      });
      await deleteObjects(orphans);
      removed += orphans.length;
    }
  }
  return removed;
}

async function step(name: string, fn: () => Promise<number>) {
  try {
    const n = await fn();
    if (n) console.log(`[jobs] ${name}: ${n}`);
  } catch (err) {
    console.error(`[jobs] ${name} failed`, err);
  }
}

async function runOnce() {
  await step("removed stale uploads", cleanupStaleUploads);
  await step("removed expired trash items", purgeOldTrash);
}

export function startJobs() {
  setTimeout(runOnce, 30_000);
  setInterval(runOnce, 60 * 60 * 1000);
  setTimeout(() => step("removed orphaned objects", sweepOrphanObjects), 10 * 60 * 1000);
  setInterval(() => step("removed orphaned objects", sweepOrphanObjects), 24 * 60 * 60 * 1000);
}
