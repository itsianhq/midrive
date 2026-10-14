import { useRef, useState, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon } from "@hugeicons/core-free-icons"
import { entriesFromDataTransfer } from "@/lib/upload/entries"
import { cn } from "@/lib/utils"
import { useDriveActions } from "./drive-actions"

/** Accepts files and folders dragged in from the desktop. */
export function UploadDropZone({
  parentId,
  enabled,
  children,
  className,
}: {
  parentId: string | null
  enabled: boolean
  children: ReactNode
  className?: string
}) {
  const actions = useDriveActions()
  const [active, setActive] = useState(false)
  const depth = useRef(0)

  const isFileDrag = (e: React.DragEvent) =>
    enabled && e.dataTransfer.types.includes("Files")

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return
        depth.current++
        setActive(true)
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return
        if (--depth.current <= 0) setActive(false)
      }}
      onDrop={async (e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        depth.current = 0
        setActive(false)
        actions.upload(await entriesFromDataTransfer(e.dataTransfer), parentId)
      }}
    >
      {children}
      {active && (
        <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary backdrop-blur-[1px]">
          <HugeiconsIcon icon={CloudUploadIcon} className="size-8" />
          Drop to upload
        </div>
      )}
    </div>
  )
}
