import { useSyncExternalStore } from "react"
import { errorMessage, fetchClient } from "@/lib/api/client"
import type { UploadEntry } from "./entries"
import { makeThumbnail } from "./thumbnail"

export type UploadStatus =
  "queued" | "uploading" | "done" | "error" | "canceled"

export type UploadItem = {
  key: string
  name: string
  size: number
  loaded: number
  status: UploadStatus
  error?: string
}

type Job = UploadItem & {
  file: File
  parentId: string | null
  /** The current attempt; cancel and retry replace it so a stale attempt stops. */
  run?: object
  xhrs: Set<XMLHttpRequest>
}

const FILE_CONCURRENCY = 3
const PART_CONCURRENCY = 4

let jobs: Job[] = []
let snapshot: UploadItem[] = []
const listeners = new Set<() => void>()
let onUploaded: () => void = () => {}

function emit() {
  snapshot = jobs.map(({ key, name, size, loaded, status, error }) => ({
    key,
    name,
    size,
    loaded,
    status,
    error,
  }))
  listeners.forEach((l) => l())
}

function update(job: Job, patch: Partial<Job>) {
  Object.assign(job, patch)
  emit()
}

/** Called after each file finishes, e.g. to refetch listings. */
export function setOnUploaded(fn: () => void) {
  onUploaded = fn
}

export function useUploads() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => snapshot
  )
}

function putWithProgress(
  job: Job,
  url: string,
  body: Blob,
  contentType: string | null,
  onProgress: (n: number) => void
) {
  return new Promise<string | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    job.xhrs.add(xhr)
    xhr.open("PUT", url)
    if (contentType) xhr.setRequestHeader("Content-Type", contentType)
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => {
      job.xhrs.delete(xhr)
      if (xhr.status >= 200 && xhr.status < 300)
        resolve(xhr.getResponseHeader("ETag"))
      else reject(new Error(`Storage rejected the upload (HTTP ${xhr.status})`))
    }
    xhr.onerror = () => {
      job.xhrs.delete(xhr)
      reject(
        new Error(
          "Network error while uploading. Check the bucket's CORS settings."
        )
      )
    }
    xhr.onabort = () => {
      job.xhrs.delete(xhr)
      reject(new DOMException("Aborted", "AbortError"))
    }
    xhr.send(body)
  })
}

async function runJob(job: Job) {
  const run = {}
  const live = () => job.run === run
  update(job, { status: "uploading", loaded: 0, run })
  let serverId: string | undefined
  try {
    const thumbnail = await makeThumbnail(job.file)
    if (!live()) return
    const { data: ticket, error } = await fetchClient.POST("/uploads", {
      body: {
        name: job.file.name,
        size: job.file.size,
        mimeType: job.file.type || undefined,
        parentId: job.parentId,
        thumbnailSize: thumbnail?.size || undefined,
      },
    })
    if (error || !ticket)
      throw new Error(errorMessage(error, "Could not start upload"))
    serverId = ticket.id
    if (!live()) return

    // Thumbnail URLs are short-lived, so send it before a possibly long upload
    if (thumbnail && ticket.thumbnailUrl) {
      await fetch(ticket.thumbnailUrl, {
        method: "PUT",
        body: thumbnail,
        headers: { "Content-Type": "image/webp" },
      }).catch(() => {})
      if (!live()) return
    }

    let parts: { partNumber: number; etag: string }[] | undefined
    if (ticket.kind === "single") {
      await putWithProgress(
        job,
        ticket.url!,
        job.file,
        ticket.contentType,
        (n) => live() && update(job, { loaded: n })
      )
    } else {
      const partSize = ticket.partSize!
      const progress = new Map<number, number>()
      const report = () =>
        live() &&
        update(job, {
          loaded: [...progress.values()].reduce((a, b) => a + b, 0),
        })
      const queue = [...ticket.parts]
      parts = []
      const worker = async () => {
        for (let p = queue.shift(); p && live(); p = queue.shift()) {
          const blob = job.file.slice(
            (p.partNumber - 1) * partSize,
            p.partNumber * partSize
          )
          const partNumber = p.partNumber
          const etag = await putWithProgress(job, p.url, blob, null, (n) => {
            progress.set(partNumber, n)
            report()
          })
          if (!etag)
            throw new Error(
              "Storage did not return an ETag. Expose the ETag header in the bucket's CORS settings."
            )
          parts!.push({ partNumber, etag })
        }
      }
      await Promise.all(Array.from({ length: PART_CONCURRENCY }, worker))
    }
    if (!live()) return

    const done = await fetchClient.POST("/uploads/{id}/complete", {
      params: { path: { id: ticket.id } },
      body: { parts },
    })
    if (done.error)
      throw new Error(errorMessage(done.error, "Could not finish upload"))
    serverId = undefined
    // Canceled while finishing: the file exists, but leave the item as the user set it
    if (live()) update(job, { status: "done", loaded: job.size })
    onUploaded()
  } catch (err) {
    if (!live()) return
    // Stop the other part uploads of this attempt
    job.xhrs.forEach((x) => x.abort())
    update(job, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    // An attempt that didn't finish releases the space it reserved
    if (serverId)
      void fetchClient.DELETE("/uploads/{id}", {
        params: { path: { id: serverId } },
      })
  }
}

function pump() {
  const active = jobs.filter((j) => j.status === "uploading").length
  const next = jobs
    .filter((j) => j.status === "queued")
    .slice(0, FILE_CONCURRENCY - active)
  for (const job of next) void runJob(job).finally(pump)
}

/** Create the folders an upload needs, returning a lookup from path to folder id. */
async function ensureFolders(entries: UploadEntry[], parentId: string | null) {
  const ids = new Map<string, string | null>([["", parentId]])
  const paths = [
    ...new Set(
      entries.flatMap((e) =>
        e.dirs.map((_, i) => e.dirs.slice(0, i + 1).join("/"))
      )
    ),
  ]
  paths.sort((a, b) => a.split("/").length - b.split("/").length)
  for (const path of paths) {
    const parts = path.split("/")
    const parent = ids.get(parts.slice(0, -1).join("/")) ?? parentId
    const { data, error } = await fetchClient.POST("/folders", {
      body: { name: parts.at(-1)!, parentId: parent },
    })
    if (error || !data)
      throw new Error(errorMessage(error, `Could not create folder "${path}"`))
    ids.set(path, data.id)
  }
  if (paths.length) onUploaded()
  return ids
}

export async function enqueueUploads(
  entries: UploadEntry[],
  parentId: string | null
) {
  if (entries.length === 0) return
  const folders = await ensureFolders(entries, parentId)
  for (const { file, dirs } of entries) {
    jobs.push({
      key: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      loaded: 0,
      status: "queued",
      file,
      parentId: folders.get(dirs.join("/")) ?? parentId,
      xhrs: new Set(),
    })
  }
  emit()
  pump()
}

export function cancelUpload(key: string) {
  const job = jobs.find((j) => j.key === key)
  if (!job || (job.status !== "queued" && job.status !== "uploading")) return
  // The running attempt sees it's stale and aborts its server upload
  update(job, { status: "canceled", run: undefined })
  job.xhrs.forEach((x) => x.abort())
  pump()
}

export function retryUpload(key: string) {
  const job = jobs.find((j) => j.key === key)
  if (!job || (job.status !== "error" && job.status !== "canceled")) return
  update(job, {
    status: "queued",
    error: undefined,
    loaded: 0,
  })
  pump()
}

export function clearFinished() {
  jobs = jobs.filter((j) => j.status === "queued" || j.status === "uploading")
  emit()
}

export function hasActiveUploads() {
  return jobs.some((j) => j.status === "queued" || j.status === "uploading")
}

window.addEventListener("beforeunload", (e) => {
  if (hasActiveUploads()) e.preventDefault()
})
