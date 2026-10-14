import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { validator } from "@/lib/validator";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { node, publicLink, user } from "@/db/schema";
import { env } from "@/env";
import { ancestors, fileUrl } from "@/lib/drive";
import { errors, json, OkSchema, RedirectResponse } from "@/lib/openapi";
import { presignGet } from "@/lib/s3";

const tags = ["Public links"];
const TokenParam = z.object({ token: z.string() });

const PublicNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "folder"]),
  name: z.string(),
  mimeType: z.string().nullable(),
  size: z.number(),
  hasThumbnail: z.boolean(),
  updatedAt: z.string(),
});

const PublicListingSchema = z.object({
  locked: z.boolean(),
  ownerName: z.string(),
  root: PublicNodeSchema.nullable(),
  folder: PublicNodeSchema.nullable(),
  crumbs: z.array(z.object({ id: z.string(), name: z.string() })),
  items: z.array(PublicNodeSchema),
});

type NodeRow = typeof node.$inferSelect;

function toPublic(row: NodeRow) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    hasThumbnail: !!row.thumbnailKey,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const cookieName = (linkId: string) => `pl_${linkId.replaceAll("-", "")}`;

async function loadLink(token: string) {
  const [row] = await db
    .select({ link: publicLink, root: node, ownerName: user.name })
    .from(publicLink)
    .innerJoin(node, eq(node.id, publicLink.nodeId))
    .innerJoin(user, eq(user.id, node.ownerId))
    .where(eq(publicLink.token, token));
  if (!row || row.root.trashedAt || row.root.status !== "ready") {
    throw new HTTPException(404, { message: "This link does not exist" });
  }
  if (row.link.expiresAt && row.link.expiresAt < new Date()) {
    throw new HTTPException(404, { message: "This link has expired" });
  }
  return row;
}

async function isUnlocked(c: Context, link: typeof publicLink.$inferSelect) {
  if (!link.passwordHash) return true;
  return (await getSignedCookie(c, env.BETTER_AUTH_SECRET, cookieName(link.id))) === link.id;
}

/** Load `nodeId` and make sure it lives inside the shared subtree. */
async function nodeInLink(rootId: string, nodeId: string | undefined) {
  if (!nodeId || nodeId === rootId) {
    const [row] = await db.select().from(node).where(eq(node.id, rootId));
    return { row: row!, crumbs: [] as { id: string; name: string }[] };
  }
  const chain = await ancestors(nodeId);
  const rootIndex = chain.findIndex((a) => a.id === rootId);
  if (rootIndex === -1) throw new HTTPException(404, { message: "Not found" });
  const [row] = await db.select().from(node).where(eq(node.id, nodeId));
  if (!row || row.trashedAt || row.status !== "ready") throw new HTTPException(404, { message: "Not found" });
  return { row, crumbs: chain.slice(rootIndex).map(({ id, name }) => ({ id, name })) };
}

async function requireUnlockedFile(c: Context, token: string, nodeId: string | undefined) {
  const { link, root } = await loadLink(token);
  if (!(await isUnlocked(c, link))) throw new HTTPException(401, { message: "Password required" });
  const { row } = await nodeInLink(root.id, nodeId);
  return row;
}

export const publicRoutes = new Hono()

  .get(
    "/public/:token",
    describeRoute({
      tags,
      operationId: "getPublicLink",
      summary: "View a public link (optionally a subfolder of it)",
      responses: { 200: json(PublicListingSchema), ...errors },
    }),
    validator("param", TokenParam),
    validator("query", z.object({ folderId: z.string().optional() })),
    async (c) => {
      const { token } = c.req.valid("param");
      const { folderId } = c.req.valid("query");
      const { link, root, ownerName } = await loadLink(token);

      if (!(await isUnlocked(c, link))) {
        return c.json({ locked: true, ownerName, root: null, folder: null, crumbs: [], items: [] });
      }

      if (root.type === "file") {
        return c.json({ locked: false, ownerName, root: toPublic(root), folder: null, crumbs: [], items: [] });
      }

      const { row: folder, crumbs } = await nodeInLink(root.id, folderId);
      if (folder.type !== "folder") throw new HTTPException(400, { message: "Not a folder" });
      const items = await db
        .select()
        .from(node)
        .where(and(eq(node.parentId, folder.id), isNull(node.trashedAt), eq(node.status, "ready")))
        .orderBy(desc(sql`${node.type} = 'folder'`), asc(sql`lower(${node.name})`));

      return c.json({
        locked: false,
        ownerName,
        root: toPublic(root),
        folder: toPublic(folder),
        crumbs: crumbs.length ? crumbs : [{ id: root.id, name: root.name }],
        items: items.map(toPublic),
      });
    },
  )

  .post(
    "/public/:token/unlock",
    describeRoute({ tags, operationId: "unlockPublicLink", responses: { 200: json(OkSchema), ...errors } }),
    validator("param", TokenParam),
    validator("json", z.object({ password: z.string() })),
    async (c) => {
      const { token } = c.req.valid("param");
      const { password } = c.req.valid("json");
      const { link } = await loadLink(token);
      if (link.passwordHash && !(await Bun.password.verify(password, link.passwordHash))) {
        throw new HTTPException(403, { message: "Wrong password" });
      }
      await setSignedCookie(c, cookieName(link.id), link.id, env.BETTER_AUTH_SECRET, {
        path: `/public/${token}`,
        httpOnly: true,
        sameSite: "Lax",
        secure: env.BETTER_AUTH_URL.startsWith("https://"),
        maxAge: 60 * 60 * 24,
      });
      return c.json({ ok: true as const });
    },
  )

  .get(
    "/public/:token/url",
    describeRoute({
      tags,
      operationId: "getPublicContentUrl",
      responses: { 200: json(z.object({ url: z.string() })), ...errors },
    }),
    validator("param", TokenParam),
    validator(
      "query",
      z.object({ nodeId: z.string().optional(), disposition: z.enum(["inline", "attachment"]).optional() }),
    ),
    async (c) => {
      const { token } = c.req.valid("param");
      const { nodeId, disposition } = c.req.valid("query");
      const file = await requireUnlockedFile(c, token, nodeId);
      return c.json({ url: await fileUrl(file, disposition ?? "inline") });
    },
  )

  .get(
    "/public/:token/content",
    describeRoute({ tags, operationId: "getPublicContent", responses: { 302: RedirectResponse, ...errors } }),
    validator("param", TokenParam),
    validator(
      "query",
      z.object({ nodeId: z.string().optional(), disposition: z.enum(["inline", "attachment"]).optional() }),
    ),
    async (c) => {
      const { token } = c.req.valid("param");
      const { nodeId, disposition } = c.req.valid("query");
      const file = await requireUnlockedFile(c, token, nodeId);
      return c.redirect(await fileUrl(file, disposition ?? "attachment"), 302);
    },
  )

  .get(
    "/public/:token/thumbnail",
    describeRoute({ tags, operationId: "getPublicThumbnail", responses: { 302: RedirectResponse, ...errors } }),
    validator("param", TokenParam),
    validator("query", z.object({ nodeId: z.string().optional() })),
    async (c) => {
      const { token } = c.req.valid("param");
      const { nodeId } = c.req.valid("query");
      const file = await requireUnlockedFile(c, token, nodeId);
      if (!file.thumbnailKey) throw new HTTPException(404, { message: "No thumbnail" });
      c.header("Cache-Control", "private, max-age=600");
      return c.redirect(await presignGet(file.thumbnailKey, { contentType: "image/webp" }), 302);
    },
  );
