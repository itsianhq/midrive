import { UserMultipleIcon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { NodeListPage } from "@/components/drive/node-list-page"
import { $api } from "@/lib/api/client"

export const Route = createFileRoute("/_app/shared")({
  component: SharedPage,
})

function SharedPage() {
  const q = $api.useQuery("get", "/views/shared")
  return (
    <NodeListPage
      title="Shared with me"
      mode="shared"
      items={q.data?.items ?? []}
      loading={q.isLoading}
      dateLabel="Shared"
      dateOf={(i) => i.sharedAt}
      emptyIcon={UserMultipleIcon}
      emptyTitle="Nothing shared with you yet"
      emptyDescription="Files and folders others share with you will appear here."
    />
  )
}
