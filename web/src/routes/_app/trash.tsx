import { Delete02Icon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { useDriveActions } from "@/components/drive/drive-actions"
import { NodeListPage } from "@/components/drive/node-list-page"
import { Button } from "@/components/ui/button"
import { $api } from "@/lib/api/client"

export const Route = createFileRoute("/_app/trash")({
  component: TrashPage,
})

function TrashPage() {
  const actions = useDriveActions()
  const q = $api.useQuery("get", "/views/trash")
  const items = q.data?.items ?? []
  return (
    <NodeListPage
      title="Trash"
      mode="trash"
      items={items}
      loading={q.isLoading}
      dateLabel="Trashed"
      dateOf={(i) => i.trashedAt ?? i.updatedAt}
      actions={
        items.length > 0 && (
          <Button variant="ghost" onClick={actions.emptyTrash}>
            Empty trash
          </Button>
        )
      }
      emptyIcon={Delete02Icon}
      emptyTitle="Trash is empty"
      emptyDescription="Items in the trash are deleted forever after the retention period."
    />
  )
}
