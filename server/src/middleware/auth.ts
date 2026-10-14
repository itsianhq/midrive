import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth, type AuthSession, type AuthUser } from "@/lib/auth";

export type AuthedEnv = {
  Variables: {
    user: AuthUser;
    session: AuthSession;
  };
};

/** Idempotent: sub-routers may each guard overlapping prefixes. */
export const requireAuth = createMiddleware<AuthedEnv>(async (c, next) => {
  if (c.get("user")) return next();
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) throw new HTTPException(401, { message: "Not signed in" });
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
});

export const requireAdmin = createMiddleware<AuthedEnv>(async (c, next) => {
  if (c.get("user").role !== "admin") throw new HTTPException(403, { message: "Admins only" });
  await next();
});
