import { and, eq, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { validator } from "@/lib/validator";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { env } from "@/env";
import { node } from "@/db/schema";
import { NodeSchema, cleanName, getNodeDto, purgeNodes, requireFolder } from "@/lib/drive";
import { errors, json, OkSchema } from "@/lib/openapi";
import {
  MULTIPART_THRESHOLD,
  abortMultipart,
  completeMultipart,
  createMultipart,
  deleteObjects,
  headObject,
  objectKey,
  presignPut,
  thumbnailKey,
} from "@/lib/s3";
import { getStorage } from "@/lib/settings";
import { requireAuth, type AuthedEnv } from "@/middleware/auth";

const tags = ["Uploads"];
const IdParam = z.object({ id: z.string() });

// Thumbnails don't count against quota, so keep them small and never larger than
// the file itself; otherwise they'd be free storage. Real ones are tens of KB.
const MAX_THUMBNAIL_SIZE = 256 * 1024;

// RFC 6838 type/subtype, no parameters
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

const CreateUploadSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative().max(env.MAX_UPLOAD_SIZE, "The file is larger than this server allows"),
  // Whatever the client claims; stored and signed into the S3 Content-Type, so
  // keep only a bare well-formed type and treat anything else as unknown.
  mimeType: z
    .string()
    .max(255)
    .optional()
    .transform((v) => {
      const type = v?.split(";")[0]!.trim().toLowerCase();
      return type && MIME_TYPE.test(type) ? type : undefined;
    }),
  parentId: z.string().nullish(),
  // Size of a client-generated WebP thumbnail to get a presigned upload URL for.
  // Ignored (no thumbnail URL) when over the limits above.
  thumbnailSize: z.number().int().positive().optional(),
});

const UploadTicketSchema = z.object({
  id: z.string(),
  kind: z.enum(["single", "multipart"]),
  contentType: z.string(),
  // kind = single
  url: z.string().nullable(),
  // kind = multipart
  partSize: z.number().nullable(),
  parts: z.array(z.object({ partNumber: z.number(), url: z.string() })),
  thumbnailUrl: z.string().nullable(),
});

const CompleteUploadSchema = z.object({
  parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string() })).optional(),
});

async function requirePendingUpload(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(node)
    .where(and(eq(node.id, id), eq(node.createdById, userId), eq(node.status, "pending")));
  if (!row || !row.storageKey) throw new HTTPException(404, { message: "Upload not found" });
  return row;
}

export const uploads = new Hono<AuthedEnv>()
  // Scoped: these routers are mounted at "/" next to public routes
  .use("/uploads", requireAuth)
  .use("/uploads/*", requireAuth)

  .post(
    "/uploads",
    describeRoute({
      tags,
      operationId: "createUpload",
      summary: "Reserve a file and get presigned upload URLs",
      responses: { 200: json(UploadTicketSchema), ...errors },
    }),
    validator("json", CreateUploadSchema),
    async (c) => {
      const me = c.get("user");
      const body = c.req.valid("json");

      let ownerId = me.id;
      if (body.parentId) ownerId = (await requireFolder(me.id, body.parentId, "editor")).node.ownerId;

      const id = crypto.randomUUID();
      const contentType = body.mimeType || "application/octet-stream";
      const key = objectKey(ownerId, id);
      const thumbSize =
        (contentType.startsWith("image/") || contentType.startsWith("video/")) &&
        body.thumbnailSize !== undefined &&
        body.thumbnailSize <= Math.min(MAX_THUMBNAIL_SIZE, body.size)
          ? body.thumbnailSize
          : undefined;

      // The pending row reserves `size` bytes. Serialize per owner so parallel
      // uploads can't all pass the check against the same `used`.
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('quota'), hashtext(${ownerId}))`);
        const { used, quota } = await getStorage(ownerId, tx);
        if (quota !== null && used + body.size > quota) {
          throw new HTTPException(400, {
            message: ownerId === me.id ? "Not enough storage space" : "The folder owner is out of storage space",
          });
        }
        await tx.insert(node).values({
          id,
          ownerId,
          createdById: me.id,
          parentId: body.parentId ?? null,
          type: "file",
          name: cleanName(body.name),
          mimeType: contentType,
          size: body.size,
          storageKey: key,
          status: "pending",
        });
      });

      try {
        const multipart =
          body.size > MULTIPART_THRESHOLD ? await createMultipart(key, contentType, body.size) : null;
        if (multipart) await db.update(node).set({ uploadId: multipart.uploadId }).where(eq(node.id, id));

        return c.json({
          id,
          kind: multipart ? ("multipart" as const) : ("single" as const),
          contentType,
          url: multipart ? null : await presignPut(key, contentType, body.size),
          partSize: multipart?.partSize ?? null,
          parts: multipart?.parts ?? [],
          thumbnailUrl: thumbSize ? await presignPut(thumbnailKey(ownerId, id), "image/webp", thumbSize) : null,
        });
      } catch (err) {
        await purgeNodes([id]);
        throw err;
      }
    },
  )

  .post(
    "/uploads/:id/complete",
    describeRoute({
      tags,
      operationId: "completeUpload",
      responses: { 200: json(NodeSchema), ...errors },
    }),
    validator("param", IdParam),
    validator("json", CompleteUploadSchema),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const { parts } = c.req.valid("json");
      const row = await requirePendingUpload(me.id, id);
      const key = row.storageKey!;

      if (row.uploadId) {
        if (!parts?.length) throw new HTTPException(400, { message: "Missing parts" });
        await completeMultipart(key, row.uploadId, parts);
      }

      const head = await headObject(key);
      if (!head) throw new HTTPException(400, { message: "The file was not uploaded" });
      // Quota was checked against the declared size, so the real one must match.
      if (head.size !== row.size) {
        await purgeNodes([id]);
        throw new HTTPException(400, { message: "The uploaded file does not match the declared size" });
      }

      const thumbKey = thumbnailKey(row.ownerId, id);
      let thumb = await headObject(thumbKey).catch(() => null);
      if (thumb && thumb.size > Math.min(MAX_THUMBNAIL_SIZE, head.size)) {
        await deleteObjects([thumbKey]).catch(() => {});
        thumb = null;
      }

      await db
        .update(node)
        .set({
          status: "ready",
          size: head.size,
          uploadId: null,
          thumbnailKey: thumb ? thumbKey : null,
        })
        .where(eq(node.id, id));
      return c.json(await getNodeDto(me.id, id));
    },
  )

  .delete(
    "/uploads/:id",
    describeRoute({ tags, operationId: "abortUpload", responses: { 200: json(OkSchema), ...errors } }),
    validator("param", IdParam),
    async (c) => {
      const me = c.get("user");
      const { id } = c.req.valid("param");
      const row = await requirePendingUpload(me.id, id);
      if (row.uploadId) await abortMultipart(row.storageKey!, row.uploadId);
      await purgeNodes([id]);
      return c.json({ ok: true as const });
    },
  );

/** Remove uploads that were started but never completed. */
export async function cleanupStaleUploads(olderThanMs = 24 * 60 * 60 * 1000) {
  const stale = await db
    .select({ id: node.id })
    .from(node)
    .where(and(eq(node.status, "pending"), lt(node.createdAt, new Date(Date.now() - olderThanMs))));
  await purgeNodes(stale.map((r) => r.id));
  return stale.length;
}
