import { Search01Icon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { NodeListPage } from "@/components/drive/node-list-page"
import { $api } from "@/lib/api/client"

export const Route = createFileRoute("/_app/search")({
  validateSearch: z.object({ q: z.string().catch("") }),
  component: SearchPage,
})

function SearchPage() {
  const { q } = Route.useSearch()
  const results = $api.useQuery(
    "get",
    "/search",
    { params: { query: { q } } },
    { enabled: q.length > 0 }
  )
  return (
    <NodeListPage
      title={q ? `Results for “${q}”` : "Search"}
      mode="view"
      items={results.data?.items ?? []}
      loading={results.isLoading}
      emptyIcon={Search01Icon}
      emptyTitle="No results"
      emptyDescription="Try a different name."
    />
  )
}
