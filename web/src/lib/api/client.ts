import createFetchClient from "openapi-fetch"
import createClient from "openapi-react-query"
import type { paths } from "./schema"

// serve.ts sets apiUrl from VITE_API_URL at container start. `bun dev` uses
// import.meta.env.VITE_API_URL, which Vite reads from the repo-root .env.
export const API_URL = (
  window.__MIDRIVE_CONFIG__?.apiUrl ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:8080"
).replace(/\/$/, "")

export const fetchClient = createFetchClient<paths>({
  baseUrl: API_URL,
  credentials: "include",
})

export const $api = createClient(fetchClient)

/** Shape of every error body returned by the server. */
export type ApiError = { error: string }

export function errorMessage(err: unknown, fallback = "Something went wrong") {
  if (err && typeof err === "object") {
    if ("error" in err && typeof err.error === "string") return err.error
    if ("message" in err && typeof err.message === "string") return err.message
  }
  return fallback
}

/** URLs used directly as <img src>/<a href>; the server redirects to S3. */
export const contentUrl = (
  id: string,
  disposition: "inline" | "attachment" = "attachment"
) => `${API_URL}/nodes/${id}/content?disposition=${disposition}`
export const thumbnailUrl = (id: string) => `${API_URL}/nodes/${id}/thumbnail`
export const publicContentUrl = (
  token: string,
  nodeId: string,
  disposition: "inline" | "attachment" = "attachment"
) =>
  `${API_URL}/public/${token}/content?nodeId=${nodeId}&disposition=${disposition}`
export const publicThumbnailUrl = (token: string, nodeId: string) =>
  `${API_URL}/public/${token}/thumbnail?nodeId=${nodeId}`
