import { Fragment } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  FolderOpenIcon,
  MoveToIcon,
  RestoreBinIcon,
  Share08Icon,
  StarIcon,
  StarOffIcon,
  UserRemove01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons"
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { DriveNode } from "@/lib/api/types"
import { useMe } from "@/lib/me"
import { useDriveActions } from "./drive-actions"

export type BrowserMode = "drive" | "shared" | "trash" | "view"

export type MenuEntry = {
  label: string
  icon: typeof ViewIcon
  onSelect: () => void
  destructive?: boolean
  separator?: boolean
}

/** Builds the actions available for an item in a given listing. */
export function useItemMenu(
  mode: BrowserMode,
  folderRole?: "owner" | "editor" | "viewer"
) {
  const me = useMe()
  const actions = useDriveActions()

  return (item: DriveNode, siblings: DriveNode[]): MenuEntry[] => {
    if (mode === "trash") {
      return [
        {
          label: "Restore",
          icon: RestoreBinIcon,
          onSelect: () => actions.restore(item),
        },
        {
          label: "Delete forever",
          icon: Delete02Icon,
          onSelect: () => actions.deleteForever(item),
          destructive: true,
        },
      ]
    }

    const owned = item.ownerId === me.user.id
    const canEdit = owned || folderRole === "editor" || folderRole === "owner"
    const entries: MenuEntry[] = [
      item.type === "folder"
        ? {
            label: "Open",
            icon: FolderOpenIcon,
            onSelect: () => actions.open(item),
          }
        : {
            label: "Preview",
            icon: ViewIcon,
            onSelect: () => actions.open(item, siblings),
          },
    ]
    if (item.type === "file")
      entries.push({
        label: "Download",
        icon: Download01Icon,
        onSelect: () => actions.download(item),
      })
    if (canEdit) {
      entries.push(
        {
          label: "Share",
          icon: Share08Icon,
          onSelect: () => actions.share(item),
          separator: true,
        },
        {
          label: "Rename",
          icon: Edit02Icon,
          onSelect: () => actions.rename(item),
        },
        { label: "Move", icon: MoveToIcon, onSelect: () => actions.move(item) }
      )
    }
    entries.push({
      label: item.starred ? "Remove from starred" : "Add to starred",
      icon: item.starred ? StarOffIcon : StarIcon,
      onSelect: () => actions.toggleStar(item),
      separator: !canEdit,
    })
    if (mode === "shared" && !owned) {
      entries.push({
        label: "Remove from Shared with me",
        icon: UserRemove01Icon,
        onSelect: () => actions.leaveShare(item),
        separator: true,
      })
    }
    // Editors can only trash what they added themselves
    if (owned || (canEdit && item.createdById === me.user.id)) {
      entries.push({
        label: "Move to trash",
        icon: Delete02Icon,
        onSelect: () => actions.trash(item),
        destructive: true,
        separator: true,
      })
    }
    return entries
  }
}

export function DropdownEntries({ entries }: { entries: MenuEntry[] }) {
  return entries.map((e) => (
    <Fragment key={e.label}>
      {e.separator && <DropdownMenuSeparator />}
      <DropdownMenuItem
        variant={e.destructive ? "destructive" : "default"}
        onClick={e.onSelect}
      >
        <HugeiconsIcon icon={e.icon} />
        {e.label}
      </DropdownMenuItem>
    </Fragment>
  ))
}

export function ContextEntries({ entries }: { entries: MenuEntry[] }) {
  return entries.map((e) => (
    <Fragment key={e.label}>
      {e.separator && <ContextMenuSeparator />}
      <ContextMenuItem
        variant={e.destructive ? "destructive" : "default"}
        onClick={e.onSelect}
      >
        <HugeiconsIcon icon={e.icon} />
        {e.label}
      </ContextMenuItem>
    </Fragment>
  ))
}
