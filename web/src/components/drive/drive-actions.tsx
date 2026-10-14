import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { $api, contentUrl } from "@/lib/api/client"
import type { DriveNode } from "@/lib/api/types"
import { entriesFromFileList, type UploadEntry } from "@/lib/upload/entries"
import { enqueueUploads } from "@/lib/upload/manager"
import { MoveDialog } from "./move-dialog"
import { PreviewDialog } from "./preview-dialog"
import { ShareDialog } from "./share-dialog"
import { ConfirmDialog, NameDialog } from "./simple-dialogs"

type DriveActions = {
  open: (item: DriveNode, siblings?: DriveNode[]) => void
  download: (item: DriveNode) => void
  newFolder: (parentId: string | null) => void
  rename: (item: DriveNode) => void
  move: (item: DriveNode) => void
  share: (item: DriveNode) => void
  toggleStar: (item: DriveNode) => void
  trash: (item: DriveNode) => void
  restore: (item: DriveNode) => void
  deleteForever: (item: DriveNode) => void
  emptyTrash: () => void
  leaveShare: (item: DriveNode) => void
  moveInto: (nodeId: string, folderId: string) => void
  pickFiles: (parentId: string | null) => void
  pickFolder: (parentId: string | null) => void
  upload: (entries: UploadEntry[], parentId: string | null) => void
}

const Ctx = createContext<DriveActions | null>(null)

export function useDriveActions() {
  const ctx = useContext(Ctx)
  if (!ctx)
    throw new Error(
      "useDriveActions must be used inside <DriveActionsProvider>"
    )
  return ctx
}

export function DriveActionsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()

  const [newFolderParent, setNewFolderParent] = useState<{
    parentId: string | null
  } | null>(null)
  const [renaming, setRenaming] = useState<DriveNode | null>(null)
  const [moving, setMoving] = useState<DriveNode | null>(null)
  const [sharing, setSharing] = useState<DriveNode | null>(null)
  const [deleting, setDeleting] = useState<DriveNode | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [preview, setPreview] = useState<{
    items: DriveNode[]
    index: number
  } | null>(null)

  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<string | null>(null)

  const createFolder = $api.useMutation("post", "/folders")
  const updateNode = $api.useMutation("patch", "/nodes/{id}")
  const setStar = $api.useMutation("put", "/nodes/{id}/star")
  const trashNode = $api.useMutation("post", "/nodes/{id}/trash")
  const restoreNode = $api.useMutation("post", "/nodes/{id}/restore")
  const deleteNode = $api.useMutation("delete", "/nodes/{id}")
  const emptyTrashM = $api.useMutation("delete", "/trash")
  const leave = $api.useMutation("delete", "/nodes/{id}/shares/me")

  const upload = useCallback(
    (entries: UploadEntry[], parentId: string | null) => {
      enqueueUploads(entries, parentId).catch((err: Error) =>
        toast.error(err.message)
      )
    },
    []
  )

  const actions = useMemo<DriveActions>(() => {
    const path = (item: DriveNode) => ({ params: { path: { id: item.id } } })
    return {
      open(item, siblings) {
        if (item.type === "folder") {
          navigate({ to: "/drive/$folderId", params: { folderId: item.id } })
          return
        }
        const files = (siblings ?? [item]).filter((i) => i.type === "file")
        setPreview({
          items: files,
          index: Math.max(
            0,
            files.findIndex((f) => f.id === item.id)
          ),
        })
      },
      download(item) {
        const a = document.createElement("a")
        a.href = contentUrl(item.id)
        a.rel = "noopener"
        document.body.appendChild(a)
        a.click()
        a.remove()
      },
      newFolder: (parentId) => setNewFolderParent({ parentId }),
      rename: setRenaming,
      move: setMoving,
      share: setSharing,
      toggleStar(item) {
        setStar.mutate({ ...path(item), body: { starred: !item.starred } })
      },
      trash(item) {
        trashNode.mutate(path(item), {
          onSuccess: () =>
            toast(`“${item.name}” moved to trash`, {
              action: {
                label: "Undo",
                onClick: () => restoreNode.mutate(path(item)),
              },
            }),
        })
      },
      restore(item) {
        restoreNode.mutate(path(item), {
          onSuccess: () => toast.success(`Restored “${item.name}”`),
        })
      },
      deleteForever: setDeleting,
      emptyTrash: () => setConfirmEmpty(true),
      leaveShare(item) {
        leave.mutate(path(item), {
          onSuccess: () => toast(`Removed “${item.name}” from Shared with me`),
        })
      },
      moveInto(nodeId, folderId) {
        if (nodeId === folderId) return
        updateNode.mutate(
          { params: { path: { id: nodeId } }, body: { parentId: folderId } },
          { onSuccess: (n) => toast.success(`Moved “${n.name}”`) }
        )
      },
      pickFiles(parentId) {
        uploadTarget.current = parentId
        filesInput.current?.click()
      },
      pickFolder(parentId) {
        uploadTarget.current = parentId
        folderInput.current?.click()
      },
      upload,
    }
  }, [navigate, setStar, trashNode, restoreNode, leave, updateNode, upload])

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length)
      upload(entriesFromFileList(e.target.files), uploadTarget.current)
    e.target.value = ""
  }

  return (
    <Ctx.Provider value={actions}>
      {children}

      <input ref={filesInput} type="file" multiple hidden onChange={onPicked} />
      <input
        ref={folderInput}
        type="file"
        hidden
        onChange={onPicked}
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
      />

      <NameDialog
        open={!!newFolderParent}
        onOpenChange={(o) => !o && setNewFolderParent(null)}
        title="New folder"
        initialValue="Untitled folder"
        submitLabel="Create"
        onSubmit={(name) =>
          createFolder.mutateAsync({
            body: { name, parentId: newFolderParent?.parentId ?? null },
          })
        }
      />

      <NameDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename"
        initialValue={renaming?.name ?? ""}
        submitLabel="Rename"
        selectBaseName={renaming?.type === "file"}
        onSubmit={(name) =>
          updateNode.mutateAsync({
            params: { path: { id: renaming!.id } },
            body: { name },
          })
        }
      />

      <MoveDialog node={moving} onOpenChange={(o) => !o && setMoving(null)} />
      <ShareDialog
        node={sharing}
        onOpenChange={(o) => !o && setSharing(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete forever?"
        description={`“${deleting?.name}” will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete forever"
        destructive
        onConfirm={() =>
          deleting &&
          deleteNode.mutate({ params: { path: { id: deleting.id } } })
        }
      />

      <ConfirmDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title="Empty trash?"
        description="All items in the trash will be permanently deleted. This can't be undone."
        confirmLabel="Empty trash"
        destructive
        onConfirm={() => emptyTrashM.mutate({})}
      />

      <PreviewDialog
        source={{ kind: "drive" }}
        items={preview?.items ?? []}
        index={preview?.index ?? null}
        onIndexChange={(index) => setPreview((p) => (p ? { ...p, index } : p))}
        onClose={() => setPreview(null)}
      />
    </Ctx.Provider>
  )
}
