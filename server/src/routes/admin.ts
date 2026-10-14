import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { validator } from "@/lib/validator";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { node, session, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { purgeNodes } from "@/lib/drive";
import { errors, json, OkSchema } from "@/lib/openapi";
import { getSettings, updateSettings } from "@/lib/settings";
import { requireAdmin, requireAuth, type AuthedEnv } from "@/middleware/auth";

const tags = ["Admin"];
const IdParam = z.object({ id: z.string() });
const UserRole = z.enum(["admin", "user"]);

const SettingsSchema = z.object({
  signupEnabled: z.boolean(),
  defaultQuota: z.number().nullable(),
  trashRetentionDays: z.number(),
});

const AdminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: UserRole,
  banned: z.boolean(),
  storageQuota: z.number().nullable(),
  used: z.number(),
  fileCount: z.number(),
  createdAt: z.string(),
});

function toSettingsDto(s: Awaited<ReturnType<typeof getSettings>>) {
  return { signupEnabled: s.signupEnabled, defaultQuota: s.defaultQuota, trashRetentionDays: s.trashRetentionDays };
}

async function requireOtherUser(meId: string, id: string) {
  if (id === meId) throw new HTTPException(400, { message: "You cannot do that to your own account" });
  const [row] = await db.select().from(user).where(eq(user.id, id));
  if (!row) throw new HTTPException(404, { message: "User not found" });
  return row;
}

export const admin = new Hono<AuthedEnv>()
  .use("/admin/*", requireAuth, requireAdmin)

  .get(
    "/admin/settings",
    describeRoute({ tags, operationId: "getSettings", responses: { 200: json(SettingsSchema), ...errors } }),
    async (c) => c.json(toSettingsDto(await getSettings())),
  )

  .patch(
    "/admin/settings",
    describeRoute({ tags, operationId: "updateSettings", responses: { 200: json(SettingsSchema), ...errors } }),
    validator(
      "json",
      z.object({
        signupEnabled: z.boolean().optional(),
        defaultQuota: z.number().int().nonnegative().nullable().optional(),
        trashRetentionDays: z.number().int().min(1).max(3650).optional(),
      }),
    ),
    async (c) => c.json(toSettingsDto(await updateSettings(c.req.valid("json")))),
  )

  .get(
    "/admin/users",
    describeRoute({
      tags,
      operationId: "listUsers",
      responses: { 200: json(z.object({ items: z.array(AdminUserSchema) })), ...errors },
    }),
    async (c) => {
      const usage = db
        .select({
          ownerId: node.ownerId,
          used: sql<string>`coalesce(sum(${node.size}), 0)`.as("used"),
          fileCount: sql<string>`count(*) filter (where ${node.type} = 'file')`.as("file_count"),
        })
        .from(node)
        .groupBy(node.ownerId)
        .as("usage");

      const rows = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          banned: user.banned,
          storageQuota: user.storageQuota,
          createdAt: user.createdAt,
          used: usage.used,
          fileCount: usage.fileCount,
        })
        .from(user)
        .leftJoin(usage, eq(usage.ownerId, user.id))
        .orderBy(asc(user.createdAt));

      return c.json({
        items: rows.map((r) => ({
          ...r,
          role: r.role === "admin" ? ("admin" as const) : ("user" as const),
          banned: !!r.banned,
          used: Number(r.used ?? 0),
          fileCount: Number(r.fileCount ?? 0),
          createdAt: r.createdAt.toISOString(),
        })),
      });
    },
  )

  .post(
    "/admin/users",
    describeRoute({ tags, operationId: "createUser", responses: { 200: json(OkSchema), ...errors } }),
    validator(
      "json",
      z.object({
        name: z.string().min(1).max(100),
        email: z.email(),
        password: z.string().min(8).max(128),
        role: UserRole.default("user"),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      await auth.api.createUser({ body, headers: c.req.raw.headers });
      return c.json({ ok: true as const });
    },
  )

  .patch(
    "/admin/users/:id",
    describeRoute({ tags, operationId: "updateUser", responses: { 200: json(OkSchema), ...errors } }),
    validator("param", IdParam),
    validator(
      "json",
      z.object({
        role: UserRole.optional(),
        banned: z.boolean().optional(),
        // null = use the instance default
        storageQuota: z.number().int().nonnegative().nullable().optional(),
      }),
    ),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      if (body.role !== undefined || body.banned !== undefined) await requireOtherUser(me.id, id);

      await db.transaction(async (tx) => {
        await tx
          .update(user)
          .set({
            ...(body.role !== undefined && { role: body.role }),
            ...(body.banned !== undefined && { banned: body.banned, banReason: null, banExpires: null }),
            ...(body.storageQuota !== undefined && { storageQuota: body.storageQuota }),
          })
          .where(eq(user.id, id));
        if (body.banned) await tx.delete(session).where(eq(session.userId, id));
      });
      return c.json({ ok: true as const });
    },
  )

  .delete(
    "/admin/users/:id",
    describeRoute({
      tags,
      operationId: "deleteUser",
      summary: "Delete a user and all of their files",
      responses: { 200: json(OkSchema), ...errors },
    }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      await requireOtherUser(me.id, id);
      const roots = await db
        .select({ id: node.id })
        .from(node)
        .where(sql`${node.ownerId} = ${id} and (${node.parentId} is null or ${node.trashedRoot})`);
      await purgeNodes(roots.map((r) => r.id));
      await db.delete(user).where(eq(user.id, id));
      return c.json({ ok: true as const });
    },
  );
