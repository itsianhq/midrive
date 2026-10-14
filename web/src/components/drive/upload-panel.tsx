import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Alert02Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { fileKind } from "@/lib/file-kind"
import { formatBytes } from "@/lib/format"
import {
  cancelUpload,
  clearFinished,
  retryUpload,
  useUploads,
  type UploadItem,
} from "@/lib/upload/manager"
import { FileIcon } from "./file-icon"

function Row({ item }: { item: UploadItem }) {
  const pct = item.size ? Math.round((item.loaded / item.size) * 100) : 100
  const active = item.status === "queued" || item.status === "uploading"
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <FileIcon
        kind={fileKind({ type: "file", name: item.name, mimeType: null })}
        className="size-4"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium" title={item.name}>
          {item.name}
        </div>
        {item.status === "uploading" && (
          <Progress value={pct} className="mt-1" />
        )}
        <div
          className="truncate text-[0.7rem] text-muted-foreground"
          title={item.error}
        >
          {item.status === "queued" && "Waiting…"}
          {item.status === "uploading" &&
            `${formatBytes(item.loaded)} of ${formatBytes(item.size)}`}
          {item.status === "done" && formatBytes(item.size)}
          {item.status === "canceled" && "Canceled"}
          {item.status === "error" && (
            <span className="text-destructive">{item.error}</span>
          )}
        </div>
      </div>
      {item.status === "done" && (
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="size-4 text-emerald-600"
        />
      )}
      {item.status === "error" && (
        <HugeiconsIcon icon={Alert02Icon} className="size-4 text-destructive" />
      )}
      {active && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Cancel upload"
          onClick={() => cancelUpload(item.key)}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      )}
      {(item.status === "error" || item.status === "canceled") && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Retry upload"
          onClick={() => retryUpload(item.key)}
        >
          <HugeiconsIcon icon={RefreshIcon} />
        </Button>
      )}
    </div>
  )
}

export function UploadPanel() {
  const uploads = useUploads()
  const [collapsed, setCollapsed] = useState(false)
  if (uploads.length === 0) return null

  const active = uploads.filter(
    (u) => u.status === "queued" || u.status === "uploading"
  )
  const failed = uploads.filter((u) => u.status === "error").length
  const title = active.length
    ? `Uploading ${active.length} item${active.length === 1 ? "" : "s"}`
    : failed
      ? `${failed} upload${failed === 1 ? "" : "s"} failed`
      : `${uploads.length} upload${uploads.length === 1 ? "" : "s"} complete`

  return (
    <div className="fixed right-4 bottom-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover shadow-lg">
      <div className="flex items-center gap-1 border-b bg-muted/50 py-1.5 pr-1.5 pl-3">
        <span className="flex-1 text-xs font-medium">{title}</span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={collapsed ? "Expand" : "Collapse"}
          onClick={() => setCollapsed(!collapsed)}
        >
          <HugeiconsIcon icon={collapsed ? ArrowUp01Icon : ArrowDown01Icon} />
        </Button>
        {active.length === 0 && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Close"
                  onClick={clearFinished}
                />
              }
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        )}
      </div>
      {!collapsed && (
        <div className="max-h-72 divide-y overflow-y-auto">
          {uploads.map((u) => (
            <Row key={u.key} item={u} />
          ))}
        </div>
      )}
    </div>
  )
}
