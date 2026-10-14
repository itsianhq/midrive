import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { validator } from "@/lib/validator";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { node, share, star, user } from "@/db/schema";
import {
  CrumbSchema,
  NodeSchema,
  RoleSchema,
  ancestors,
  cleanName,
  fileUrl,
  getNodeDto,
  nodeSelection,
  purgeNodes,
  requireAccess,
  requireFolder,
  selectNodes,
  sharedWithUserSql,
  subtreeIds,
  toDto,
} from "@/lib/drive";
import { errors, json, OkSchema, RedirectResponse } from "@/lib/openapi";
import { presignGet } from "@/lib/s3";
import { requireAuth, type AuthedEnv } from "@/middleware/auth";

const tags = ["Drive"];
const IdParam = z.object({ id: z.string() });

const FolderListingSchema = z.object({
  folder: NodeSchema.nullable(),
  crumbs: z.array(CrumbSchema),
  role: RoleSchema,
  viaShare: z.boolean(),
  items: z.array(NodeSchema),
});

const NodeDetailSchema = z.object({
  node: NodeSchema,
  crumbs: z.array(CrumbSchema),
  role: RoleSchema,
  viaShare: z.boolean(),
});

const ItemsSchema = z.object({ items: z.array(NodeSchema) });

const SharedItemSchema = NodeSchema.extend({ role: z.enum(["viewer", "editor"]), sharedAt: z.string() });

const UrlSchema = z.object({ url: z.string() });

const folderFirst = [desc(sql`${node.type} = 'folder'`), asc(sql`lower(${node.name})`)];
const visible = and(isNull(node.trashedAt), eq(node.status, "ready"));

export const nodes = new Hono<AuthedEnv>()
  // Scoped: these routers are mounted at "/" next to public routes
  .use("/drive", requireAuth)
  .use("/nodes/*", requireAuth)
  .use("/folders", requireAuth)
  .use("/trash", requireAuth)
  .use("/views/*", requireAuth)
  .use("/search", requireAuth)

  .get(
    "/drive",
    describeRoute({
      tags,
      operationId: "listFolder",
      summary: "List a folder (omit folderId for your root)",
      responses: { 200: json(FolderListingSchema), ...errors },
    }),
    validator("query", z.object({ folderId: z.string().optional() })),
    async (c) => {
      const me = c.get("user");
      const { folderId } = c.req.valid("query");

      if (!folderId) {
        const rows = await selectNodes(me.id)
          .where(and(eq(node.ownerId, me.id), isNull(node.parentId), visible))
          .orderBy(...folderFirst);
        return c.json({ folder: null, crumbs: [], role: "owner" as const, viaShare: false, items: rows.map(toDto) });
      }

      const access = await requireFolder(me.id, folderId, "viewer");
      const rows = await selectNodes(me.id)
        .where(and(eq(node.parentId, folderId), visible))
        .orderBy(...folderFirst);
      return c.json({
        folder: await getNodeDto(me.id, folderId),
        crumbs: access.crumbs,
        role: access.role,
        viaShare: access.viaShare,
        items: rows.map(toDto),
      });
    },
  )

  .get(
    "/nodes/:id",
    describeRoute({ tags, operationId: "getNode", responses: { 200: json(NodeDetailSchema), ...errors } }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const access = await requireAccess(me.id, id, "viewer");
      return c.json({
        node: await getNodeDto(me.id, id),
        crumbs: access.crumbs,
        role: access.role,
        viaShare: access.viaShare,
      });
    },
  )

  .post(
    "/folders",
    describeRoute({ tags, operationId: "createFolder", responses: { 200: json(NodeSchema), ...errors } }),
    validator("json", z.object({ name: z.string().min(1).max(255), parentId: z.string().nullish() })),
    async (c) => {
      const me = c.get("user");
      const body = c.req.valid("json");
      let ownerId = me.id;
      if (body.parentId) ownerId = (await requireFolder(me.id, body.parentId, "editor")).node.ownerId;

      const [row] = await db
        .insert(node)
        .values({
          id: crypto.randomUUID(),
          ownerId,
          createdById: me.id,
          parentId: body.parentId ?? null,
          type: "folder",
          name: cleanName(body.name),
        })
        .returning();
      return c.json(await getNodeDto(me.id, row!.id));
    },
  )

  .patch(
    "/nodes/:id",
    describeRoute({
      tags,
      operationId: "updateNode",
      summary: "Rename and/or move a node",
      responses: { 200: json(NodeSchema), ...errors },
    }),
    validator("param", IdParam),
    validator(
      "json",
      z.object({
        name: z.string().min(1).max(255).optional(),
        // null moves the node to the owner's root
        parentId: z.string().nullable().optional(),
      }),
    ),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const { node: current, role } = await requireAccess(me.id, id, "editor");
      if (current.trashedAt) throw new HTTPException(400, { message: "Restore the item before changing it" });

      const patch: Partial<typeof node.$inferInsert> = {};
      if (body.name !== undefined) patch.name = cleanName(body.name);

      if (body.parentId !== undefined && body.parentId !== current.parentId) {
        if (body.parentId === null) {
          if (role !== "owner") throw new HTTPException(403, { message: "Only the owner can move this to their root" });
        } else {
          const target = await requireFolder(me.id, body.parentId, "editor");
          if (target.node.ownerId !== current.ownerId) {
            throw new HTTPException(400, { message: "Items can only be moved within the same owner's drive" });
          }
          const chain = await ancestors(target.node.id);
          if (chain.some((a) => a.id === current.id)) {
            throw new HTTPException(400, { message: "A folder cannot be moved into itself" });
          }
        }
        patch.parentId = body.parentId;
      }

      if (Object.keys(patch).length > 0) await db.update(node).set(patch).where(eq(node.id, id));
      return c.json(await getNodeDto(me.id, id));
    },
  )

  .put(
    "/nodes/:id/star",
    describeRoute({ tags, operationId: "setStarred", responses: { 200: json(OkSchema), ...errors } }),
    validator("param", IdParam),
    validator("json", z.object({ starred: z.boolean() })),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { starred } = c.req.valid("json");
      await requireAccess(me.id, id, "viewer");
      if (starred) {
        await db.insert(star).values({ userId: me.id, nodeId: id }).onConflictDoNothing();
      } else {
        await db.delete(star).where(and(eq(star.userId, me.id), eq(star.nodeId, id)));
      }
      return c.json({ ok: true as const });
    },
  )

  .post(
    "/nodes/:id/trash",
    describeRoute({ tags, operationId: "trashNode", responses: { 200: json(OkSchema), ...errors } }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { node: current, role } = await requireAccess(me.id, id, "editor");
      if (current.trashedAt) return c.json({ ok: true as const });

      const ids = await subtreeIds(id);
      // Editors may only trash what they added themselves, so they can't wipe out a shared tree.
      if (role !== "owner") {
        const [others] = await db
          .select({ id: node.id })
          .from(node)
          .where(and(sql`${node.id} in ${ids}`, sql`${node.createdById} is distinct from ${me.id}`))
          .limit(1);
        if (others) {
          throw new HTTPException(403, { message: "Only the owner can trash items added by other people" });
        }
      }
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(node)
          .set({ trashedAt: now })
          .where(and(sql`${node.id} in ${ids}`, isNull(node.trashedAt)));
        await tx.update(node).set({ trashedRoot: true }).where(eq(node.id, id));
      });
      return c.json({ ok: true as const });
    },
  )

  .post(
    "/nodes/:id/restore",
    describeRoute({ tags, operationId: "restoreNode", responses: { 200: json(NodeSchema), ...errors } }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { node: current } = await requireAccess(me.id, id, "owner");
      if (!current.trashedAt || !current.trashedRoot) {
        throw new HTTPException(400, { message: "This item is not in the trash" });
      }

      let parentId = current.parentId;
      if (parentId) {
        const [parent] = await db.select({ trashedAt: node.trashedAt }).from(node).where(eq(node.id, parentId));
        if (!parent || parent.trashedAt) parentId = null;
      }

      const ids = await subtreeIds(id);
      await db.transaction(async (tx) => {
        // Only bring back what was trashed together with this node.
        await tx
          .update(node)
          .set({ trashedAt: null })
          .where(and(sql`${node.id} in ${ids}`, eq(node.trashedAt, current.trashedAt!)));
        await tx.update(node).set({ trashedRoot: false, trashedAt: null, parentId }).where(eq(node.id, id));
      });
      return c.json(await getNodeDto(me.id, id));
    },
  )

  .delete(
    "/nodes/:id",
    describeRoute({
      tags,
      operationId: "deleteNode",
      summary: "Permanently delete a trashed node",
      responses: { 200: json(OkSchema), ...errors },
    }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { node: current } = await requireAccess(me.id, id, "owner");
      if (!current.trashedAt) throw new HTTPException(400, { message: "Move the item to the trash first" });
      await purgeNodes([id]);
      return c.json({ ok: true as const });
    },
  )

  .delete(
    "/trash",
    describeRoute({ tags, operationId: "emptyTrash", responses: { 200: json(OkSchema), ...errors } }),
    async (c) => {
      const me = c.get("user");
      const roots = await db
        .select({ id: node.id })
        .from(node)
        .where(and(eq(node.ownerId, me.id), eq(node.trashedRoot, true)));
      await purgeNodes(roots.map((r) => r.id));
      return c.json({ ok: true as const });
    },
  )

  .get(
    "/nodes/:id/url",
    describeRoute({
      tags,
      operationId: "getContentUrl",
      summary: "Get a short-lived URL for the file contents",
      responses: { 200: json(UrlSchema), ...errors },
    }),
    validator("param", IdParam),
    validator("query", z.object({ disposition: z.enum(["inline", "attachment"]).optional() })),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { disposition } = c.req.valid("query");
      const { node: file } = await requireAccess(me.id, id, "viewer");
      return c.json({ url: await fileUrl(file, disposition ?? "inline") });
    },
  )

  .get(
    "/nodes/:id/content",
    describeRoute({
      tags,
      operationId: "getContent",
      summary: "Redirect to the file contents",
      responses: { 302: RedirectResponse, ...errors },
    }),
    validator("param", IdParam),
    validator("query", z.object({ disposition: z.enum(["inline", "attachment"]).optional() })),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { disposition } = c.req.valid("query");
      const { node: file } = await requireAccess(me.id, id, "viewer");
      return c.redirect(await fileUrl(file, disposition ?? "attachment"), 302);
    },
  )

  .get(
    "/nodes/:id/thumbnail",
    describeRoute({ tags, operationId: "getThumbnail", responses: { 302: RedirectResponse, ...errors } }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { node: file } = await requireAccess(me.id, id, "viewer");
      if (!file.thumbnailKey) throw new HTTPException(404, { message: "No thumbnail" });
      c.header("Cache-Control", "private, max-age=600");
      return c.redirect(await presignGet(file.thumbnailKey, { contentType: "image/webp" }), 302);
    },
  )

  .get(
    "/views/recent",
    describeRoute({ tags, operationId: "listRecent", responses: { 200: json(ItemsSchema), ...errors } }),
    async (c) => {
      const me = c.get("user");
      const rows = await selectNodes(me.id)
        .where(and(eq(node.type, "file"), visible, or(eq(node.ownerId, me.id), sharedWithUserSql(me.id))))
        .orderBy(desc(node.updatedAt))
        .limit(100);
      return c.json({ items: rows.map(toDto) });
    },
  )

  .get(
    "/views/starred",
    describeRoute({ tags, operationId: "listStarred", responses: { 200: json(ItemsSchema), ...errors } }),
    async (c) => {
      const me = c.get("user");
      const rows = await selectNodes(me.id)
        .innerJoin(star, and(eq(star.nodeId, node.id), eq(star.userId, me.id)))
        .where(and(visible, or(eq(node.ownerId, me.id), sharedWithUserSql(me.id))))
        .orderBy(...folderFirst);
      return c.json({ items: rows.map(toDto) });
    },
  )

  .get(
    "/views/trash",
    describeRoute({ tags, operationId: "listTrash", responses: { 200: json(ItemsSchema), ...errors } }),
    async (c) => {
      const me = c.get("user");
      const rows = await selectNodes(me.id)
        .where(and(eq(node.ownerId, me.id), eq(node.trashedRoot, true)))
        .orderBy(desc(node.trashedAt));
      return c.json({ items: rows.map(toDto) });
    },
  )

  .get(
    "/views/shared",
    describeRoute({
      tags,
      operationId: "listSharedWithMe",
      responses: { 200: json(z.object({ items: z.array(SharedItemSchema) })), ...errors },
    }),
    async (c) => {
      const me = c.get("user");
      const rows = await db
        .select({ ...nodeSelection(me.id), shareRole: share.role, sharedAt: share.createdAt })
        .from(node)
        .innerJoin(user, eq(user.id, node.ownerId))
        .innerJoin(share, and(eq(share.nodeId, node.id), eq(share.userId, me.id)))
        .where(visible)
        .orderBy(desc(share.createdAt));
      return c.json({
        items: rows.map((r) => ({ ...toDto(r), role: r.shareRole, sharedAt: r.sharedAt.toISOString() })),
      });
    },
  )

  .get(
    "/search",
    describeRoute({ tags, operationId: "search", responses: { 200: json(ItemsSchema), ...errors } }),
    validator("query", z.object({ q: z.string().min(1).max(200) })),
    async (c) => {
      const me = c.get("user");
      const { q } = c.req.valid("query");
      const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const rows = await selectNodes(me.id)
        .where(and(visible, ilike(node.name, pattern), or(eq(node.ownerId, me.id), sharedWithUserSql(me.id))))
        .orderBy(...folderFirst)
        .limit(200);
      return c.json({ items: rows.map(toDto) });
    },
  );
