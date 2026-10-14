import { Clock01Icon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { NodeListPage } from "@/components/drive/node-list-page"
import { $api } from "@/lib/api/client"

export const Route = createFileRoute("/_app/recent")({
  component: RecentPage,
})

function RecentPage() {
  const q = $api.useQuery("get", "/views/recent")
  return (
    <NodeListPage
      title="Recent"
      mode="view"
      items={q.data?.items ?? []}
      loading={q.isLoading}
      emptyIcon={Clock01Icon}
      emptyTitle="No recent files"
      emptyDescription="Files you upload or change will show up here."
    />
  )
}
