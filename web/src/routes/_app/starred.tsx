import { StarIcon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { NodeListPage } from "@/components/drive/node-list-page"
import { $api } from "@/lib/api/client"

export const Route = createFileRoute("/_app/starred")({
  component: StarredPage,
})

function StarredPage() {
  const q = $api.useQuery("get", "/views/starred")
  return (
    <NodeListPage
      title="Starred"
      mode="view"
      items={q.data?.items ?? []}
      loading={q.isLoading}
      emptyIcon={StarIcon}
      emptyTitle="No starred items"
      emptyDescription="Star files and folders to find them quickly here."
    />
  )
}
