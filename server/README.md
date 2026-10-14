# MiDrive server

Hono API on Bun. See the [root README](../README.md) for setup.

```sh
bun install
bun dev            # watch mode on :8080
bun run build      # bundle to dist/
bun run db:generate  # create a migration after editing src/db/schema.ts
```

- Routes: `src/routes/*` (each documented with `describeRoute` + zod, exported at `/openapi.json`, UI at `/docs`)
- Auth: Better Auth at `/auth/*` (`src/lib/auth.ts`)
- Access control and tree helpers: `src/lib/drive.ts`
- Background cleanup (stale uploads, expired trash): `src/jobs.ts`
