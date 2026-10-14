# MiDrive web

React SPA. See the [root README](../README.md) for setup.

```sh
bun install
bun dev            # :5173, talks to VITE_API_URL
bun run gen:api    # regenerate src/lib/api/schema.d.ts from the running server
bun run build
```

- Routes (TanStack Router, file-based): `src/routes/`
- Typed API client (`openapi-fetch` + `openapi-react-query`): `src/lib/api/client.ts`
- Upload pipeline (presigned single/multipart, thumbnails): `src/lib/upload/`
