# MiDrive web

React SPA. See the [root README](../README.md) for setup.

```sh
bun install
bun dev            # :5173, talks to VITE_API_URL from the repo-root .env
bun run gen:api    # regenerate src/lib/api/schema.d.ts from the running server
bun run build      # no API URL required
VITE_API_URL=http://localhost:8080 bun serve.ts   # serve dist/ on :5173 (PORT); VITE_API_URL required
```

- Routes (TanStack Router, file-based): `src/routes/`
- Typed API client (`openapi-fetch` + `openapi-react-query`): `src/lib/api/client.ts`
- Upload pipeline (presigned single/multipart, thumbnails): `src/lib/upload/`
