import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import {
  contentUrl,
  errorMessage,
  fetchClient,
  publicContentUrl,
} from "@/lib/api/client"
import { fileKind, isPreviewable } from "@/lib/file-kind"
import { formatBytes } from "@/lib/format"
import { FileIcon } from "./file-icon"

export type PreviewSource =
  { kind: "drive" } | { kind: "public"; token: string }

export type PreviewItem = {
  id: string
  name: string
  type: "file" | "folder"
  mimeType: string | null
  size: number
}

const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024

export function downloadUrl(source: PreviewSource, id: string) {
  return source.kind === "drive"
    ? contentUrl(id)
    : publicContentUrl(source.token, id)
}

function usePresignedUrl(source: PreviewSource, id: string) {
  return useQuery({
    queryKey: ["presigned", source, id],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res =
        source.kind === "drive"
          ? await fetchClient.GET("/nodes/{id}/url", {
              params: { path: { id }, query: { disposition: "inline" } },
            })
          : await fetchClient.GET("/public/{token}/url", {
              params: {
                path: { token: source.token },
                query: { nodeId: id, disposition: "inline" },
              },
            })
      if (res.error || !res.data) throw new Error(errorMessage(res.error))
      return res.data.url
    },
  })
}

function TextPreview({ url }: { url: string }) {
  const text = useQuery({
    queryKey: ["preview-text", url],
    queryFn: async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.text()
    },
  })
  if (text.isLoading) return <Spinner className="size-6" />
  if (text.error)
    return (
      <p className="text-sm text-muted-foreground">Could not load the file.</p>
    )
  return (
    <pre className="h-full w-full overflow-auto rounded-md bg-muted/50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
      {text.data}
    </pre>
  )
}

function PreviewBody({
  source,
  item,
}: {
  source: PreviewSource
  item: PreviewItem
}) {
  const kind = fileKind(item)
  const previewable =
    isPreviewable(kind) &&
    !((kind === "text" || kind === "code") && item.size > TEXT_PREVIEW_LIMIT)
  const url = usePresignedUrl(source, item.id)

  if (!previewable) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileIcon kind={kind} />
          </EmptyMedia>
          <EmptyTitle>No preview available</EmptyTitle>
          <EmptyDescription>
            {item.name} · {formatBytes(item.size)}
          </EmptyDescription>
        </EmptyHeader>
        <Button
          nativeButton={false}
          render={<a href={downloadUrl(source, item.id)} />}
        >
          <HugeiconsIcon icon={Download01Icon} />
          Download
        </Button>
      </Empty>
    )
  }

  if (url.isLoading) return <Spinner className="size-6" />
  if (url.error || !url.data)
    return (
      <p className="text-sm text-muted-foreground">{errorMessage(url.error)}</p>
    )

  switch (kind) {
    case "image":
      return (
        <img
          src={url.data}
          alt={item.name}
          className="max-h-full max-w-full bg-checkerboard object-contain"
        />
      )
    case "video":
      return (
        <video
          src={url.data}
          controls
          autoPlay
          className="max-h-full max-w-full"
        />
      )
    case "audio":
      return (
        <audio src={url.data} controls autoPlay className="w-full max-w-lg" />
      )
    case "pdf":
      return (
        <iframe
          src={url.data}
          title={item.name}
          className="h-full w-full rounded-md bg-white"
        />
      )
    default:
      return <TextPreview url={url.data} />
  }
}

export function PreviewDialog({
  source,
  items,
  index,
  onIndexChange,
  onClose,
}: {
  source: PreviewSource
  items: PreviewItem[]
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const item = index === null ? null : items[index]
  const hasPrev = index !== null && index > 0
  const hasNext = index !== null && index < items.length - 1

  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1)
      if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, hasPrev, hasNext, onIndexChange])

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[90svh] w-[95vw] max-w-none flex-col gap-0 p-0 sm:max-w-6xl">
        {item && (
          <>
            <div className="flex items-center gap-3 border-b px-4 py-3 pr-12">
              <FileIcon kind={fileKind(item)} />
              <DialogTitle className="min-w-0 flex-1 truncate text-sm">
                {item.name}
              </DialogTitle>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {formatBytes(item.size)}
              </span>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<a href={downloadUrl(source, item.id)} />}
              >
                <HugeiconsIcon icon={Download01Icon} />
                Download
              </Button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
              <PreviewBody key={item.id} source={source} item={item} />
              {hasPrev && (
                <Button
                  size="icon-lg"
                  variant="secondary"
                  className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full shadow"
                  aria-label="Previous"
                  onClick={() => onIndexChange(index! - 1)}
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} />
                </Button>
              )}
              {hasNext && (
                <Button
                  size="icon-lg"
                  variant="secondary"
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full shadow"
                  aria-label="Next"
                  onClick={() => onIndexChange(index! + 1)}
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} />
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
