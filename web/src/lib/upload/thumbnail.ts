const MAX_SIZE = 480
const TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ])
}

function draw(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_SIZE / Math.max(width, height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.8)
  )
}

async function imageThumbnail(url: string) {
  const img = new Image()
  img.src = url
  await img.decode()
  return draw(img, img.naturalWidth || MAX_SIZE, img.naturalHeight || MAX_SIZE)
}

async function videoThumbnail(url: string) {
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "metadata"
  video.src = url
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve
    video.onerror = reject
  })
  video.currentTime = Math.min(1, (video.duration || 0) / 2)
  await new Promise((resolve) => (video.onseeked = resolve))
  return draw(video, video.videoWidth, video.videoHeight)
}

/** Best-effort WebP thumbnail for images and videos, generated in the browser. */
export async function makeThumbnail(file: File): Promise<Blob | null> {
  const isImage = file.type.startsWith("image/")
  const isVideo = file.type.startsWith("video/")
  if (!isImage && !isVideo) return null
  if (isImage && file.size > 60 * 1024 * 1024) return null

  const url = URL.createObjectURL(file)
  try {
    return await withTimeout(
      isImage ? imageThumbnail(url) : videoThumbnail(url),
      TIMEOUT_MS
    )
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
