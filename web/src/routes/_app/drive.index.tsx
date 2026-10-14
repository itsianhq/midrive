import { createFileRoute } from "@tanstack/react-router"
import { FolderView } from "@/components/drive/folder-view"

export const Route = createFileRoute("/_app/drive/")({
  component: () => <FolderView folderId={null} />,
})
