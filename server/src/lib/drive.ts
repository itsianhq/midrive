import { and, eq, getColumns, inArray, sql, type SQL } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { node, share, star, user } from "@/db/schema";
import { abortMultipart, deleteObjects, presignGet, thumbnailKey } from "./s3";

export type NodeRow = typeof node.$inferSelect;
export type Role = "owner" | "editor" | "viewer";

const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export const RoleSchema = z.enum(["owner", "editor", "viewer"]);

export const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "folder"]),
  name: z.string(),
  mimeType: z.string().nullable(),
  size: z.number(),
  parentId: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  createdById: z.string().nullable(),
  hasThumbnail: z.boolean(),
  starred: z.boolean(),
  trashedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NodeDto = z.infer<typeof NodeSchema>;

export const CrumbSchema = z.object({ id: z.string(), name: z.string() });

/** Columns needed to build a NodeDto for `userId`. */
export function nodeSelection(userId: string) {
  return {
    ...getColumns(node),
    ownerName: user.name,
    starred: sql<boolean>`exists (select 1 from ${star} where ${star.nodeId} = ${node.id} and ${star.userId} = ${userId})`,
  };
}

export function selectNodes(userId: string) {
  return db
    .select(nodeSelection(userId))
    .from(node)
    .innerJoin(user, eq(user.id, node.ownerId))
    .$dynamic();
}

export function toDto(row: NodeRow & { ownerName: string; starred: boolean }): NodeDto {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    parentId: row.parentId,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    createdById: row.createdById,
    hasThumbnail: !!row.thumbnailKey,
    starred: !!row.starred,
    trashedAt: row.trashedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getNodeDto(userId: string, id: string) {
  const [row] = await selectNodes(userId).where(eq(node.id, id));
  if (!row) throw new HTTPException(404, { message: "Not found" });
  return toDto(row);
}

/** Self and ancestors, ordered from the top of the tree down to `id`. */
export async function ancestors(id: string) {
  return db.execute<{ id: string; name: string; parent_id: string | null; depth: number }>(
    sql`
      with recursive anc as (
        select id, name, parent_id, 0 as depth from ${node} where id = ${id}
        union all
        select n.id, n.name, n.parent_id, anc.depth + 1
        from ${node} n join anc on n.id = anc.parent_id
      )
      select id, name, parent_id, depth from anc order by depth desc
    `,
    "objects",
  );
}

/** Ids of `id` and every descendant. */
export async function subtreeIds(id: string) {
  const rows = await db.execute<{ id: string }>(
    sql`
      with recursive sub as (
        select id from ${node} where id = ${id}
        union all
        select n.id from ${node} n join sub on n.parent_id = sub.id
      )
      select id from sub
    `,
    "objects",
  );
  return rows.map((r) => r.id);
}

/** SQL predicate: node is inside a subtree that has been shared with `userId`. */
export function sharedWithUserSql(userId: string): SQL {
  return sql`${node.id} in (
    with recursive acc as (
      select s.node_id as id from ${share} s where s.user_id = ${userId}
      union
      select n.id from ${node} n join acc on n.parent_id = acc.id
    )
    select id from acc
  )`;
}

export type Access = {
  node: NodeRow;
  role: Role;
  /** Breadcrumbs visible to this user (top → node itself). */
  crumbs: { id: string; name: string }[];
  /** True when access comes from a share rather than ownership. */
  viaShare: boolean;
};

export async function resolveAccess(userId: string, id: string): Promise<Access | null> {
  const [row] = await db.select().from(node).where(eq(node.id, id));
  if (!row) return null;

  const chain = await ancestors(id);
  if (row.ownerId === userId) {
    return { node: row, role: "owner", crumbs: chain.map(({ id, name }) => ({ id, name })), viaShare: false };
  }

  // Others never see trashed or half-uploaded items.
  if (row.trashedAt || row.status !== "ready") return null;

  const shares = await db
    .select({ nodeId: share.nodeId, role: share.role })
    .from(share)
    .where(and(eq(share.userId, userId), inArray(share.nodeId, chain.map((c) => c.id))));
  if (shares.length === 0) return null;

  const role: Role = shares.some((s) => s.role === "editor") ? "editor" : "viewer";
  const sharedIds = new Set(shares.map((s) => s.nodeId));
  const topIndex = chain.findIndex((c) => sharedIds.has(c.id));
  const crumbs = chain.slice(topIndex).map(({ id, name }) => ({ id, name }));
  return { node: row, role, crumbs, viaShare: true };
}

export async function requireAccess(userId: string, id: string, min: Role): Promise<Access> {
  const access = await resolveAccess(userId, id);
  if (!access) throw new HTTPException(404, { message: "Not found" });
  if (RANK[access.role] < RANK[min]) {
    throw new HTTPException(403, { message: `You need ${min} access to do that` });
  }
  return access;
}

export async function requireFolder(userId: string, id: string, min: Role) {
  const access = await requireAccess(userId, id, min);
  if (access.node.type !== "folder") throw new HTTPException(400, { message: "Not a folder" });
  if (access.node.trashedAt) throw new HTTPException(400, { message: "Folder is in the trash" });
  return access;
}

/** Permanently delete nodes (and their subtrees) from the DB and S3. */
export async function purgeNodes(rootIds: string[]) {
  if (rootIds.length === 0) return;
  const rows = await db.execute<{
    id: string;
    owner_id: string;
    status: "pending" | "ready";
    storage_key: string | null;
    thumbnail_key: string | null;
    upload_id: string | null;
  }>(
    sql`
      with recursive sub as (
        select id from ${node} where id in ${rootIds}
        union
        select n.id from ${node} n join sub on n.parent_id = sub.id
      )
      select n.id, n.owner_id, n.status, n.storage_key, n.thumbnail_key, n.upload_id
      from ${node} n join sub on n.id = sub.id
    `,
    "objects",
  );

  await db.delete(node).where(inArray(node.id, rootIds));

  for (const r of rows) {
    if (r.upload_id && r.storage_key) await abortMultipart(r.storage_key, r.upload_id);
  }
  await deleteObjects(
    rows.flatMap((r) => [
      r.storage_key,
      // A pending upload may already have a thumbnail that isn't linked to the row yet
      r.thumbnail_key ?? (r.status === "pending" ? thumbnailKey(r.owner_id, r.id) : null),
    ]),
  ).catch((err) => {
    console.error("Failed to delete some S3 objects", err);
  });
}

// Types a browser only displays and never executes. The mime type is whatever the
// uploader claimed, so anything else (HTML, SVG, XML, ...) is served as a download
// to keep it from running script on the storage origin.
const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/apng",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-m4v",
  "video/x-matroska",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/flac",
  "audio/aac",
  "audio/x-m4a",
  "audio/opus",
  "application/pdf",
]);

function servedAs(file: NodeRow, disposition: "inline" | "attachment") {
  let type = (file.mimeType ?? "").split(";")[0]!.trim().toLowerCase();
  if ((!type || type === "application/octet-stream") && /\.pdf$/i.test(file.name)) type = "application/pdf";
  if (INLINE_TYPES.has(type)) return { disposition, contentType: type };
  // SVG keeps its type so <img> still renders it; `attachment` stops it running when opened directly.
  return { disposition: "attachment" as const, contentType: type === "image/svg+xml" ? type : "application/octet-stream" };
}

export async function fileUrl(file: NodeRow, disposition: "inline" | "attachment") {
  if (file.type !== "file" || !file.storageKey || file.status !== "ready") {
    throw new HTTPException(400, { message: "Not a downloadable file" });
  }
  return presignGet(file.storageKey, { filename: file.name, ...servedAs(file, disposition) });
}

export function cleanName(name: string) {
  const trimmed = name.trim().replace(/[\\/]/g, "_");
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new HTTPException(400, { message: "Invalid name" });
  }
  return trimmed.slice(0, 255);
}
