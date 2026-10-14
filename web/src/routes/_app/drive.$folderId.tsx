import { createFileRoute } from "@tanstack/react-router"
import { FolderView } from "@/components/drive/folder-view"

export const Route = createFileRoute("/_app/drive/$folderId")({
  component: FolderPage,
})

function FolderPage() {
  const { folderId } = Route.useParams()
  return <FolderView key={folderId} folderId={folderId} />
}
