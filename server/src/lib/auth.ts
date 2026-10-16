import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins/admin";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { asc, eq, sql } from "drizzle-orm";
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
  advanced: {
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"], trustedProxies: env.TRUSTED_PROXIES },
  },
  plugins: [admin()],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Admin actions go through the app's /admin routes, which enforce its rules
      // (no self-demotion, deleting a user's files). Only server-side calls may use
      // the plugin's endpoints; over HTTP they'd skip those rules.
      if (ctx.path.startsWith("/admin/") && ctx.request) throw new APIError("NOT_FOUND");
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
        // The very first account becomes the admin. Serialised with an advisory
        // lock so concurrent sign-ups can't both miss (or both take) the role.
        after: async (created) => {
          await db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext('midrive:first-admin'))`);
            const [admin] = await tx
              .select({ id: user.id })
              .from(user)
              .where(eq(user.role, "admin"))
              .limit(1);
            if (admin) return;
            const [first] = await tx
              .select({ id: user.id })
              .from(user)
              .orderBy(asc(user.createdAt), asc(user.id))
              .limit(1);
            if (first?.id === created.id) {
              await tx.update(user).set({ role: "admin" }).where(eq(user.id, created.id));
            }
          });
        },
      },
    },
  },
});

/**
 * Rate limits key on x-forwarded-for, which clients can forge. Rebuild it from the
 * socket address, keeping the forwarded chain only when TRUSTED_PROXIES is set
 * (Better Auth then walks it right to left, skipping the trusted hops).
 */
export function withClientIp(req: Request, peer: string | undefined) {
  const headers = new Headers(req.headers);
  const chain = env.TRUSTED_PROXIES.length > 0 ? headers.get("x-forwarded-for") : null;
  if (peer) headers.set("x-forwarded-for", chain ? `${chain}, ${peer}` : peer);
  else headers.delete("x-forwarded-for");
  return new Request(req, { headers });
}

export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;
