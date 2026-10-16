import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { openAPIRouteHandler } from "hono-openapi";
import { runMigrations } from "@/db/drizzle";
import { env } from "@/env";
import { startJobs } from "@/jobs";
import { auth } from "@/lib/auth";
import { admin } from "@/routes/admin";
import { me } from "@/routes/me";
import { nodes } from "@/routes/nodes";
import { publicRoutes } from "@/routes/public";
import { shares } from "@/routes/shares";
import { uploads } from "@/routes/uploads";

const app = new Hono();

app.use(logger());
app.use(
  cors({
    origin: env.TRUSTED_ORIGINS,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);

app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

app
  .route("/", me)
  .route("/", publicRoutes)
  .route("/", nodes)
  .route("/", shares)
  .route("/", uploads)
  .route("/", admin);

app.get("/health", (c) => c.json({ ok: true }));

// API spec and docs UI are for development only
if (env.NODE_ENV !== "production") {
  app.get(
    "/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "MiDrive API",
          version: "1.0.0",
          description: "Self-hosted file storage. Authentication endpoints live under /auth (Better Auth).",
        },
        servers: [{ url: env.BETTER_AUTH_URL }],
      },
    }),
  );
  app.get(
    "/docs",
    Scalar({ url: "/openapi.json", pageTitle: "MiDrive API", favicon: `${env.TRUSTED_ORIGINS[0]}/favicon.svg` }),
  );
}

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

if (process.env.SKIP_MIGRATIONS !== "1") await runMigrations();
startJobs();

export default {
  port: env.PORT,
  fetch: app.fetch,
};

export { app };
