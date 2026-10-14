import { HugeiconsIcon } from "@hugeicons/react"
import {
  Doc01Icon,
  File01Icon,
  Folder01Icon,
  Image01Icon,
  MusicNote01Icon,
  Pdf01Icon,
  Ppt01Icon,
  SourceCodeIcon,
  Txt01Icon,
  Video01Icon,
  Xls01Icon,
  Zip01Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import type { FileKind } from "@/lib/file-kind"

const ICONS: Record<FileKind, { icon: typeof File01Icon; color: string }> = {
  folder: { icon: Folder01Icon, color: "text-amber-500" },
  image: { icon: Image01Icon, color: "text-rose-500" },
  video: { icon: Video01Icon, color: "text-purple-500" },
  audio: { icon: MusicNote01Icon, color: "text-pink-500" },
  pdf: { icon: Pdf01Icon, color: "text-red-600" },
  text: { icon: Txt01Icon, color: "text-slate-500" },
  code: { icon: SourceCodeIcon, color: "text-emerald-600" },
  archive: { icon: Zip01Icon, color: "text-yellow-700" },
  document: { icon: Doc01Icon, color: "text-blue-600" },
  spreadsheet: { icon: Xls01Icon, color: "text-green-600" },
  presentation: { icon: Ppt01Icon, color: "text-orange-500" },
  other: { icon: File01Icon, color: "text-muted-foreground" },
}

export function FileIcon({
  kind,
  className,
}: {
  kind: FileKind
  className?: string
}) {
  const { icon, color } = ICONS[kind]
  return (
    <HugeiconsIcon
      icon={icon}
      strokeWidth={1.75}
      className={cn("size-5 shrink-0", color, className)}
    />
  )
}
