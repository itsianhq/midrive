import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { validator } from "@/lib/validator";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { publicLink, share, user } from "@/db/schema";
import { requireAccess } from "@/lib/drive";
import { errors, json, OkSchema } from "@/lib/openapi";
import { requireAuth, type AuthedEnv } from "@/middleware/auth";

const tags = ["Sharing"];
const IdParam = z.object({ id: z.string() });
const ShareRole = z.enum(["viewer", "editor"]);

const PersonSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });

const ShareSchema = z.object({
  id: z.string(),
  role: ShareRole,
  user: PersonSchema,
  sharedById: z.string().nullable(),
  createdAt: z.string(),
});

const SharesSchema = z.object({ owner: PersonSchema, items: z.array(ShareSchema) });

const LinkSchema = z.object({
  id: z.string(),
  token: z.string(),
  hasPassword: z.boolean(),
  expiresAt: z.string().nullable(),
  expired: z.boolean(),
  createdAt: z.string(),
});

function toLinkDto(row: typeof publicLink.$inferSelect) {
  return {
    id: row.id,
    token: row.token,
    hasPassword: !!row.passwordHash,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    expired: !!row.expiresAt && row.expiresAt < new Date(),
    createdAt: row.createdAt.toISOString(),
  };
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Buffer.from(bytes).toString("base64url");
}

async function requireShare(shareId: string) {
  const [row] = await db.select().from(share).where(eq(share.id, shareId));
  if (!row) throw new HTTPException(404, { message: "Share not found" });
  return row;
}

export const shares = new Hono<AuthedEnv>()
  // Scoped: these routers are mounted at "/" next to public routes
  .use("/nodes/*", requireAuth)
  .use("/shares/*", requireAuth)
  .use("/links/*", requireAuth)

  .get(
    "/nodes/:id/shares",
    describeRoute({ tags, operationId: "listShares", responses: { 200: json(SharesSchema), ...errors } }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { node } = await requireAccess(me.id, id, "viewer");

      const [owner] = await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, node.ownerId));
      const rows = await db
        .select({
          id: share.id,
          role: share.role,
          sharedById: share.sharedById,
          createdAt: share.createdAt,
          user: { id: user.id, name: user.name, email: user.email },
        })
        .from(share)
        .innerJoin(user, eq(user.id, share.userId))
        .where(eq(share.nodeId, id))
        .orderBy(asc(share.createdAt));

      return c.json({
        owner: owner!,
        items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      });
    },
  )

  .post(
    "/nodes/:id/shares",
    describeRoute({
      tags,
      operationId: "createShare",
      summary: "Share with another user by email (owners: updates the role if already shared; editors: viewers only)",
      responses: { 200: json(OkSchema), ...errors },
    }),
    validator("param", IdParam),
    validator("json", z.object({ email: z.email(), role: ShareRole })),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { email, role } = c.req.valid("json");
      const { node, role: myRole } = await requireAccess(me.id, id, "editor");
      const isOwner = myRole === "owner";
      if (!isOwner && role !== "viewer") {
        throw new HTTPException(403, { message: "Only the owner can add editors" });
      }

      const [target] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase()));
      if (!target) throw new HTTPException(404, { message: "No user with that email on this instance" });
      if (target.id === node.ownerId) throw new HTTPException(400, { message: "That user already owns this item" });
      // A self-share would outlive the share it came from if the owner later removed it
      if (target.id === me.id) throw new HTTPException(400, { message: "You can't share an item with yourself" });

      const insert = db
        .insert(share)
        .values({ id: crypto.randomUUID(), nodeId: id, userId: target.id, role, sharedById: me.id });
      // Editors can't change an existing share (e.g. demote another editor)
      await (isOwner
        ? insert.onConflictDoUpdate({ target: [share.nodeId, share.userId], set: { role } })
        : insert.onConflictDoNothing());
      return c.json({ ok: true as const });
    },
  )

  .patch(
    "/shares/:id",
    describeRoute({ tags, operationId: "updateShare", responses: { 200: json(OkSchema), ...errors } }),
    validator("param", IdParam),
    validator("json", z.object({ role: ShareRole })),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { role } = c.req.valid("json");
      const row = await requireShare(id);
      await requireAccess(me.id, row.nodeId, "owner");
      await db.update(share).set({ role }).where(eq(share.id, id));
      return c.json({ ok: true as const });
    },
  )

  .delete(
    "/shares/:id",
    describeRoute({
      tags,
      operationId: "deleteShare",
      summary: "Remove someone's access (owner; users can also remove their own, editors viewers they added)",
      responses: { 200: json(OkSchema), ...errors },
    }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const row = await requireShare(id);
      if (row.userId !== me.id) {
        const ownInvite = row.sharedById === me.id && row.role === "viewer";
        await requireAccess(me.id, row.nodeId, ownInvite ? "editor" : "owner");
      }
      await db.delete(share).where(eq(share.id, id));
      return c.json({ ok: true as const });
    },
  )

  .delete(
    "/nodes/:id/shares/me",
    describeRoute({
      tags,
      operationId: "leaveShare",
      summary: "Remove an item from 'Shared with me'",
      responses: { 200: json(OkSchema), ...errors },
    }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      await db.delete(share).where(and(eq(share.nodeId, id), eq(share.userId, me.id)));
      return c.json({ ok: true as const });
    },
  )

  .get(
    "/nodes/:id/links",
    describeRoute({
      tags,
      operationId: "listLinks",
      responses: { 200: json(z.object({ items: z.array(LinkSchema) })), ...errors },
    }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      await requireAccess(me.id, id, "owner");
      const rows = await db.select().from(publicLink).where(eq(publicLink.nodeId, id)).orderBy(asc(publicLink.createdAt));
      return c.json({ items: rows.map(toLinkDto) });
    },
  )

  .post(
    "/nodes/:id/links",
    describeRoute({ tags, operationId: "createLink", responses: { 200: json(LinkSchema), ...errors } }),
    validator("param", IdParam),
    validator(
      "json",
      z.object({
        password: z.string().min(1).max(200).optional(),
        expiresAt: z.iso.datetime({ offset: true }).optional(),
      }),
    ),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await requireAccess(me.id, id, "owner");

      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (expiresAt && expiresAt <= new Date()) throw new HTTPException(400, { message: "Expiry must be in the future" });

      const [row] = await db
        .insert(publicLink)
        .values({
          id: crypto.randomUUID(),
          token: randomToken(),
          nodeId: id,
          createdById: me.id,
          passwordHash: body.password ? await Bun.password.hash(body.password) : null,
          expiresAt,
        })
        .returning();
      return c.json(toLinkDto(row!));
    },
  )

  .delete(
    "/links/:id",
    describeRoute({ tags, operationId: "deleteLink", responses: { 200: json(OkSchema), ...errors } }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const [row] = await db.select().from(publicLink).where(eq(publicLink.id, id));
      if (!row) throw new HTTPException(404, { message: "Link not found" });
      await requireAccess(me.id, row.nodeId, "owner");
      await db.delete(publicLink).where(eq(publicLink.id, id));
      return c.json({ ok: true as const });
    },
  );
