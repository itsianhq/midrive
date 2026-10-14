const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]

export function formatBytes(bytes: number, digits = 1) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1
  )
  const value = bytes / 1024 ** i
  return `${value.toFixed(i === 0 ? 0 : value < 10 ? digits : 0)} ${UNITS[i]}`
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })
const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: "short" })

export function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return timeFmt.format(d)
  return dateFmt.format(d)
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso))
}

export const GB = 1024 ** 3
