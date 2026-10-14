import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { $api } from "@/lib/api/client"
import type { DriveNode } from "@/lib/api/types"
import { useMe } from "@/lib/me"
import { FileIcon } from "./file-icon"

type Props = { node: DriveNode | null; onOpenChange: (open: boolean) => void }

export function MoveDialog({ node, onOpenChange }: Props) {
  if (!node) return null
  return (
    <MoveDialogBody key={node.id} node={node} onOpenChange={onOpenChange} />
  )
}

function MoveDialogBody({ node, onOpenChange }: Props & { node: DriveNode }) {
  const me = useMe()
  const [folderId, setFolderId] = useState<string | null>(node.parentId)
  const move = $api.useMutation("patch", "/nodes/{id}")
  const listing = $api.useQuery("get", "/drive", {
    params: { query: folderId ? { folderId } : {} },
  })

  const isOwner = node.ownerId === me.user.id
  const folders =
    listing.data?.items.filter(
      (i) => i.type === "folder" && i.id !== node.id
    ) ?? []
  const canMoveHere =
    folderId !== node.parentId &&
    (folderId === null ? isOwner : listing.data?.role !== "viewer")

  async function moveHere() {
    await move.mutateAsync({
      params: { path: { id: node.id } },
      body: { parentId: folderId },
    })
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">
            Move “{node.name}”
          </DialogTitle>
        </DialogHeader>

        <nav className="flex flex-wrap items-center gap-1 text-xs">
          {isOwner && (
            <button
              className="rounded px-1 py-0.5 hover:bg-muted"
              onClick={() => setFolderId(null)}
            >
              My Drive
            </button>
          )}
          {listing.data?.crumbs.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              {(isOwner || c !== listing.data.crumbs[0]) && (
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-3 text-muted-foreground"
                />
              )}
              <button
                className="max-w-40 truncate rounded px-1 py-0.5 hover:bg-muted"
                onClick={() => setFolderId(c.id)}
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="h-64 overflow-y-auto rounded-md border">
          {listing.isLoading && (
            <div className="grid gap-2 p-2">
              <Skeleton className="h-7" />
              <Skeleton className="h-7" />
            </div>
          )}
          {listing.data && folders.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No folders here
            </p>
          )}
          {folders.map((f) => (
            <button
              key={f.id}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
              onClick={() => setFolderId(f.id)}
            >
              <FileIcon kind="folder" className="size-4" />
              <span className="flex-1 truncate">{f.name}</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="size-3.5 text-muted-foreground"
              />
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={moveHere} disabled={!canMoveHere || move.isPending}>
            {move.isPending && <Spinner />}
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
