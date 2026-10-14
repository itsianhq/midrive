import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { errors, json } from "@/lib/openapi";
import { countUsers, getSettings, getStorage } from "@/lib/settings";
import { requireAuth, type AuthedEnv } from "@/middleware/auth";

const MeSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.enum(["admin", "user"]),
  }),
  storage: z.object({
    used: z.number(),
    // null = unlimited
    quota: z.number().nullable(),
  }),
});

const ConfigSchema = z.object({
  signupEnabled: z.boolean(),
  // True until the first account (the admin) has been created
  needsSetup: z.boolean(),
});

export const me = new Hono<AuthedEnv>()
  .get(
    "/config",
    describeRoute({
      tags: ["Account"],
      operationId: "getConfig",
      summary: "Public instance configuration",
      responses: { 200: json(ConfigSchema) },
    }),
    async (c) => {
      const [settings, users] = await Promise.all([getSettings(), countUsers()]);
      return c.json({ signupEnabled: settings.signupEnabled || users === 0, needsSetup: users === 0 });
    },
  )

  .get(
    "/me",
    describeRoute({ tags: ["Account"], operationId: "getMe", responses: { 200: json(MeSchema), ...errors } }),
    requireAuth,
    async (c) => {
      const user = c.get("user");
      return c.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role === "admin" ? ("admin" as const) : ("user" as const),
        },
        storage: await getStorage(user.id),
      });
    },
  );
