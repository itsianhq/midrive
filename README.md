<p align="center">
  <img src="web/public/favicon.svg" alt="MiDrive logo" width="96" height="96" />
</p>

<h1 align="center">MiDrive</h1>

Self-hosted Google Drive, Dropbox & OneDrive alternative. Files live in **your own S3-compatible bucket**
(AWS S3, Cloudflare R2, Backblaze B2, MinIO, RustFS, Garage, …); metadata lives in Postgres.

Two independent apps, no monorepo:

| Folder    | Stack                                                                                    |
| --------- | ---------------------------------------------------------------------------------------- |
| `server/` | Bun · Hono · hono-openapi (zod) · Better Auth · Drizzle ORM · Postgres · AWS SDK v3      |
| `web/`    | Vite · React 19 · TanStack Router + Query · openapi-fetch + openapi-react-query · shadcn |

The web app's API types are generated from the server's OpenAPI spec (`/openapi.json`).
Interactive API docs are served at `/docs`.

## Features

- Folders, upload (files and whole folders, drag & drop), download, rename, move (dialog or drag onto a folder)
- Uploads go **straight from the browser to S3** via presigned URLs; files over 64 MB use parallel multipart uploads
- Image/video thumbnails generated in the browser; preview for images, video, audio, PDF, text and code
- Trash with restore and automatic purge, starred, recent, search
- Share with other users as viewer/editor ("Shared with me"), public links with optional password and expiry
- Email + password auth (Better Auth). First account becomes admin. Sign-ups are closed by default; admins can
  open them, create/ban/delete users, and set default and per-user storage quotas.

## Todo

- [x] Folders, upload (files, folders, drag & drop), download, rename, move
- [x] Direct-to-S3 uploads with presigned URLs and multipart for large files
- [x] Thumbnails and in-browser preview (images, video, audio, PDF, text, code)
- [x] Trash with restore and auto-purge, starred, recent, search
- [x] Sharing with users (viewer/editor) and public links (password, expiry)
- [x] Email + password auth, admin panel, sign-up control, storage quotas
- [x] Typed API client generated from the OpenAPI spec
- [ ] Docker images, CI and tagged releases
- [ ] Desktop client with folder sync
- [ ] Mobile app

## S3 bucket setup

Create a bucket and an access key limited to it. Browsers talk to the bucket directly, so it needs CORS:

```json
[
  {
    "AllowedOrigins": ["https://drive.example.org"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`ExposeHeaders: ETag` is required for multipart uploads. The bucket can (and should) stay private.

Some providers (e.g. Wasabi) ship a default CORS policy that allows every origin, so things work without
any setup. You can still replace it with the rule above to restrict browser access to your own web origin.

## Local development

All Postgres, server and web settings live in a single `.env` at the repo root:

```sh
cp .env.example .env        # set BETTER_AUTH_SECRET and S3_* values
docker compose up -d postgres

cd server
bun install
bun dev                     # http://localhost:8080 (migrations run on boot)

cd ../web
bun install
bun dev                     # http://localhost:5173
```

Open http://localhost:5173 and create the first (admin) account.

After changing API routes, regenerate the client types with the server running:

```sh
cd web && bun run gen:api
```

Database schema changes: edit `server/src/db/schema.ts`, then `bun run db:generate` in `server/`.
