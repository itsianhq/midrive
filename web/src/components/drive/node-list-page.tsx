import type { ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PageHeader } from "@/components/page-header"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { thumbnailUrl } from "@/lib/api/client"
import type { DriveNode } from "@/lib/api/types"
import { useMe } from "@/lib/me"
import { useDriveActions } from "./drive-actions"
import { FileBrowser, useViewMode, ViewToggle } from "./file-browser"
import { useItemMenu, type BrowserMode } from "./item-menu"

/** A flat list of nodes (Recent, Starred, Trash, Search, Shared with me). */
export function NodeListPage<T extends DriveNode>({
  title,
  mode,
  items,
  loading,
  actions: headerActions,
  dateLabel,
  dateOf,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: {
  title: ReactNode
  mode: BrowserMode
  items: T[]
  loading: boolean
  actions?: ReactNode
  dateLabel?: string
  dateOf?: (item: T) => string
  emptyIcon: Parameters<typeof HugeiconsIcon>[0]["icon"]
  emptyTitle: string
  emptyDescription: string
}) {
  const me = useMe()
  const actions = useDriveActions()
  const [view, setView] = useViewMode()
  const menu = useItemMenu(mode)

  return (
    <>
      <PageHeader
        title={title}
        actions={
          <>
            {headerActions}
            <ViewToggle mode={view} onChange={setView} />
          </>
        }
      />
      <FileBrowser<T>
        items={items}
        loading={loading}
        view={view}
        thumbnailUrl={(i) => thumbnailUrl(i.id)}
        onOpen={(i) =>
          mode === "trash" && i.type === "folder"
            ? undefined
            : actions.open(i, items)
        }
        menu={(i) => menu(i, items)}
        ownerLabel={(i) => (i.ownerId === me.user.id ? "me" : i.ownerName)}
        dateLabel={dateLabel}
        dateOf={dateOf}
        empty={
          <Empty className="mt-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={emptyIcon} />
              </EmptyMedia>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
    </>
  )
}
