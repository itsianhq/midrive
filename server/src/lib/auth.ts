import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins/admin";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { account, session, user, verification } from "@/db/schema";
import { env } from "@/env";
import { countUsers, getSettings } from "./settings";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.TRUSTED_ORIGINS,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      storageQuota: { type: "number", required: false, input: false },
    },
  },
  plugins: [admin()],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      // The very first account can always be created; it becomes the admin.
      if ((await countUsers()) === 0) return;
      const { signupEnabled } = await getSettings();
      if (!signupEnabled) {
        throw new APIError("FORBIDDEN", { message: "Sign-ups are disabled on this instance" });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          if ((await countUsers()) === 1) {
            await db.update(user).set({ role: "admin" }).where(eq(user.id, created.id));
          }
        },
      },
    },
  },
});

export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;
