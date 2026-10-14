export type FileKind =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "code"
  | "archive"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "other"

const CODE_EXT = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "json",
  "html",
  "css",
  "scss",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "sh",
  "bash",
  "zsh",
  "yml",
  "yaml",
  "toml",
  "xml",
  "sql",
  "swift",
  "lua",
  "vue",
  "svelte",
  "ini",
  "env",
  "dockerfile",
])
const TEXT_EXT = new Set(["txt", "md", "markdown", "csv", "tsv", "log", "rtf"])
const ARCHIVE_EXT = new Set([
  "zip",
  "tar",
  "gz",
  "tgz",
  "rar",
  "7z",
  "bz2",
  "xz",
  "zst",
])
const DOC_EXT = new Set(["doc", "docx", "odt", "pages"])
const SHEET_EXT = new Set(["xls", "xlsx", "ods", "numbers"])
const SLIDES_EXT = new Set(["ppt", "pptx", "odp", "key"])

export function extension(name: string) {
  const i = name.lastIndexOf(".")
  return i > 0 ? name.slice(i + 1).toLowerCase() : ""
}

export function fileKind(item: {
  type: "file" | "folder"
  name: string
  mimeType: string | null
}): FileKind {
  if (item.type === "folder") return "folder"
  const mime = item.mimeType ?? ""
  const ext = extension(item.name)
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  if (mime === "application/pdf" || ext === "pdf") return "pdf"
  if (CODE_EXT.has(ext)) return "code"
  if (mime.startsWith("text/") || TEXT_EXT.has(ext)) return "text"
  if (ARCHIVE_EXT.has(ext)) return "archive"
  if (DOC_EXT.has(ext)) return "document"
  if (SHEET_EXT.has(ext)) return "spreadsheet"
  if (SLIDES_EXT.has(ext)) return "presentation"
  return "other"
}

/** Kinds the preview dialog can render in the browser. */
export function isPreviewable(kind: FileKind) {
  return ["image", "video", "audio", "pdf", "text", "code"].includes(kind)
}
