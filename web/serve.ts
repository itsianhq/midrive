import { resolve, sep } from "node:path"

const apiUrl = process.env.VITE_API_URL?.trim().replace(/\/$/, "")
if (!apiUrl) {
  console.error("VITE_API_URL is required")
  process.exit(1)
}

const configJs = `window.__MIDRIVE_CONFIG__=${JSON.stringify({ apiUrl }).replaceAll("<", "\\u003c")}\n`

const root = resolve(import.meta.dir, "dist")
const port = Number(process.env.PORT) || 5173

const indexHtml = await Bun.file(`${root}/index.html`).text()

const html = () =>
  new Response(indexHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  })

const server = Bun.serve({
  port,
  async fetch(req) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      })
    }

    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(req.url).pathname)
    } catch {
      return new Response("Bad Request", { status: 400 })
    }

    if (pathname === "/config.js") {
      return new Response(req.method === "HEAD" ? null : configJs, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      })
    }

    if (pathname === "/" || pathname === "/index.html") return html()

    const path = resolve(root, `.${pathname}`)
    if (!path.startsWith(root + sep)) {
      return new Response("Not Found", { status: 404 })
    }

    const file = Bun.file(path)
    if (await file.exists()) {
      // Vite emits content-hashed names under /assets/
      const cacheControl = pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache"
      return new Response(file, { headers: { "Cache-Control": cacheControl } })
    }

    // A missing hashed asset is a real 404, not a client-side route
    if (pathname.startsWith("/assets/")) {
      return new Response("Not Found", { status: 404 })
    }

    return html()
  },
})

console.log(`Serving ${root} on ${server.url}`)
