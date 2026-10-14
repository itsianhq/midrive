import { useState, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  GridViewIcon,
  ListViewIcon,
  MoreVerticalIcon,
  StarIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { fileKind } from "@/lib/file-kind"
import { formatBytes, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FileIcon } from "./file-icon"
import { ContextEntries, DropdownEntries, type MenuEntry } from "./item-menu"

export const NODE_DRAG_TYPE = "application/x-midrive-node"

export type BrowserItem = {
  id: string
  type: "file" | "folder"
  name: string
  mimeType: string | null
  size: number
  hasThumbnail: boolean
  updatedAt: string
  starred?: boolean
}

export type ViewMode = "grid" | "list"

export function useViewMode() {
  const [mode, setMode] = useState<ViewMode>(() =>
    localStorage.getItem("midrive:view") === "grid" ? "grid" : "list"
  )
  return [
    mode,
    (m: ViewMode) => {
      localStorage.setItem("midrive:view", m)
      setMode(m)
    },
  ] as const
}

export function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode
  onChange: (m: ViewMode) => void
}) {
  const next = mode === "grid" ? "list" : "grid"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Switch to ${next} view`}
            onClick={() => onChange(next)}
          />
        }
      >
        <HugeiconsIcon icon={mode === "grid" ? ListViewIcon : GridViewIcon} />
      </TooltipTrigger>
      <TooltipContent>
        {next === "grid" ? "Grid view" : "List view"}
      </TooltipContent>
    </Tooltip>
  )
}

type Props<T extends BrowserItem> = {
  items: T[]
  loading?: boolean
  view: ViewMode
  thumbnailUrl: (item: T) => string
  onOpen: (item: T) => void
  menu?: (item: T) => MenuEntry[]
  ownerLabel?: (item: T) => string
  dateLabel?: string
  dateOf?: (item: T) => string
  canDrag?: (item: T) => boolean
  onDropIntoFolder?: (nodeId: string, folderId: string) => void
  empty: ReactNode
}

function Thumb<T extends BrowserItem>({
  item,
  url,
  className,
  iconClassName,
}: {
  item: T
  url: (item: T) => string
  className?: string
  iconClassName?: string
}) {
  const [failed, setFailed] = useState(false)
  const kind = fileKind(item)
  if (item.hasThumbnail && !failed) {
    return (
      <img
        src={url(item)}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
        className={cn("bg-checkerboard object-cover", className)}
      />
    )
  }
  return <FileIcon kind={kind} className={iconClassName} />
}

function ItemFrame<T extends BrowserItem>({
  item,
  props,
  children,
  className,
}: {
  item: T
  props: Props<T>
  children: ReactNode
  className?: string
}) {
  const [dropping, setDropping] = useState(false)
  const draggable = props.canDrag?.(item) ?? false
  const isDropTarget = item.type === "folder" && !!props.onDropIntoFolder

  const body = (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(NODE_DRAG_TYPE, item.id)
        e.dataTransfer.effectAllowed = "move"
      }}
      onDragOver={(e) => {
        if (!isDropTarget || !e.dataTransfer.types.includes(NODE_DRAG_TYPE))
          return
        e.preventDefault()
        e.stopPropagation()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        if (!isDropTarget || !e.dataTransfer.types.includes(NODE_DRAG_TYPE))
          return
        e.preventDefault()
        e.stopPropagation()
        setDropping(false)
        props.onDropIntoFolder!(e.dataTransfer.getData(NODE_DRAG_TYPE), item.id)
      }}
      onDoubleClick={() => props.onOpen(item)}
      onKeyDown={(e) => e.key === "Enter" && props.onOpen(item)}
      className={cn(
        "group/item cursor-default outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        dropping && "bg-primary/10 ring-2 ring-primary",
        className
      )}
    >
      {children}
    </div>
  )

  if (!props.menu) return body
  return (
    <ContextMenu>
      <ContextMenuTrigger render={body} />
      <ContextMenuContent className="w-52">
        <ContextEntries entries={props.menu(item)} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

function ItemMenuButton<T extends BrowserItem>({
  item,
  menu,
}: {
  item: T
  menu?: (item: T) => MenuEntry[]
}) {
  if (!menu) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${item.name}`}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        }
      >
        <HugeiconsIcon icon={MoreVerticalIcon} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownEntries entries={menu(item)} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Name<T extends BrowserItem>({
  item,
  onOpen,
}: {
  item: T
  onOpen: (item: T) => void
}) {
  return (
    <button
      type="button"
      className="min-w-0 truncate text-left font-medium hover:underline"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(item)
      }}
      title={item.name}
    >
      {item.name}
    </button>
  )
}

function StarMark({ starred }: { starred?: boolean }) {
  if (!starred) return null
  return (
    <HugeiconsIcon
      icon={StarIcon}
      className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
    />
  )
}

function ListView<T extends BrowserItem>(props: Props<T>) {
  const dateOf = props.dateOf ?? ((i: T) => i.updatedAt)
  return (
    <div className="text-xs">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b px-3 py-2 font-medium text-muted-foreground md:grid-cols-[minmax(0,1fr)_10rem_8rem_6rem_2rem]">
        <span>Name</span>
        <span className="hidden md:block">
          {props.ownerLabel ? "Owner" : ""}
        </span>
        <span className="hidden md:block">{props.dateLabel ?? "Modified"}</span>
        <span className="hidden md:block">Size</span>
        <span />
      </div>
      {props.items.map((item) => (
        <ItemFrame
          key={item.id}
          item={item}
          props={props}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-3 py-1.5 hover:bg-muted/60 md:grid-cols-[minmax(0,1fr)_10rem_8rem_6rem_2rem]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded">
              <Thumb
                item={item}
                url={props.thumbnailUrl}
                className="size-8 rounded"
              />
            </div>
            <Name item={item} onOpen={props.onOpen} />
            <StarMark starred={item.starred} />
          </div>
          <span className="hidden truncate text-muted-foreground md:block">
            {props.ownerLabel?.(item)}
          </span>
          <span className="hidden text-muted-foreground md:block">
            {formatDate(dateOf(item))}
          </span>
          <span className="hidden text-muted-foreground md:block">
            {item.type === "folder" ? "—" : formatBytes(item.size)}
          </span>
          <div className="flex justify-end">
            <ItemMenuButton item={item} menu={props.menu} />
          </div>
        </ItemFrame>
      ))}
    </div>
  )
}

function GridView<T extends BrowserItem>(props: Props<T>) {
  const folders = props.items.filter((i) => i.type === "folder")
  const files = props.items.filter((i) => i.type === "file")
  return (
    <div className="grid gap-6 p-3">
      {folders.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Folders</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2">
            {folders.map((item) => (
              <ItemFrame
                key={item.id}
                item={item}
                props={props}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-xs hover:bg-muted/60"
              >
                <FileIcon kind="folder" />
                <Name item={item} onOpen={props.onOpen} />
                <StarMark starred={item.starred} />
                <div className="ml-auto">
                  <ItemMenuButton item={item} menu={props.menu} />
                </div>
              </ItemFrame>
            ))}
          </div>
        </section>
      )}
      {files.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Files</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
            {files.map((item) => (
              <ItemFrame
                key={item.id}
                item={item}
                props={props}
                className="flex flex-col overflow-hidden rounded-lg border bg-card text-xs hover:bg-muted/60"
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <FileIcon kind={fileKind(item)} className="size-4" />
                  <Name item={item} onOpen={props.onOpen} />
                  <StarMark starred={item.starred} />
                  <div className="ml-auto">
                    <ItemMenuButton item={item} menu={props.menu} />
                  </div>
                </div>
                <button
                  type="button"
                  className="mx-2 mb-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-muted/60"
                  onClick={() => props.onOpen(item)}
                  tabIndex={-1}
                >
                  <Thumb
                    item={item}
                    url={props.thumbnailUrl}
                    className="size-full"
                    iconClassName="size-12"
                  />
                </button>
              </ItemFrame>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function FileBrowser<T extends BrowserItem>(props: Props<T>) {
  if (props.loading) {
    return (
      <div className="grid gap-2 p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    )
  }
  if (props.items.length === 0) return <>{props.empty}</>
  return props.view === "grid" ? (
    <GridView {...props} />
  ) : (
    <ListView {...props} />
  )
}
