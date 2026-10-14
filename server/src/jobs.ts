import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { node } from "@/db/schema";
import { purgeNodes } from "@/lib/drive";
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

async function runOnce() {
  try {
    const uploads = await cleanupStaleUploads();
    const trash = await purgeOldTrash();
    if (uploads || trash) console.log(`[jobs] removed ${uploads} stale uploads, ${trash} expired trash items`);
  } catch (err) {
    console.error("[jobs] cleanup failed", err);
  }
}

export function startJobs() {
  setTimeout(runOnce, 30_000);
  setInterval(runOnce, 60 * 60 * 1000);
}
