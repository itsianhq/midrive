import { Fragment, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Download01Icon,
  FolderOpenIcon,
  LockPasswordIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import {
  FileBrowser,
  useViewMode,
  ViewToggle,
} from "@/components/drive/file-browser"
import { FileIcon } from "@/components/drive/file-icon"
import type { MenuEntry } from "@/components/drive/item-menu"
import {
  downloadUrl,
  PreviewDialog,
  type PreviewSource,
} from "@/components/drive/preview-dialog"
import { Logo } from "@/components/logo"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { $api, errorMessage, publicThumbnailUrl } from "@/lib/api/client"
import type { PublicNode } from "@/lib/api/types"
import { fileKind } from "@/lib/file-kind"
import { formatBytes } from "@/lib/format"

export const Route = createFileRoute("/s/$token")({
  validateSearch: z.object({ folder: z.string().optional() }),
  component: PublicPage,
})

function Unlock({ token, ownerName }: { token: string; ownerName: string }) {
  const queryClient = useQueryClient()
  const unlock = $api.useMutation("post", "/public/{token}/unlock", {
    meta: { silent: true },
  })
  const [password, setPassword] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await unlock
      .mutateAsync({ params: { path: { token } }, body: { password } })
      .catch(() => {})
    await queryClient.invalidateQueries()
  }

  return (
    <Card className="mx-auto mt-16 w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HugeiconsIcon icon={LockPasswordIcon} className="size-4" />
          Password required
        </CardTitle>
        <CardDescription>
          {ownerName} protected this link with a password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3">
          <Input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {unlock.error && (
            <FieldError>{errorMessage(unlock.error)}</FieldError>
          )}
          <Button type="submit" disabled={unlock.isPending}>
            {unlock.isPending && <Spinner />}
            Unlock
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function PublicPage() {
  const { token } = Route.useParams()
  const { folder } = Route.useSearch()
  const navigate = useNavigate()
  const [view, setView] = useViewMode()
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const listing = $api.useQuery("get", "/public/{token}", {
    params: { path: { token }, query: folder ? { folderId: folder } : {} },
  })
  const source: PreviewSource = { kind: "public", token }
  const data = listing.data

  const files = data?.items.filter((i) => i.type === "file") ?? []
  const open = (item: PublicNode) => {
    if (item.type === "folder")
      navigate({
        to: "/s/$token",
        params: { token },
        search: { folder: item.id },
      })
    else setPreviewIndex(files.findIndex((f) => f.id === item.id))
  }
  const menu = (item: PublicNode): MenuEntry[] =>
    item.type === "folder"
      ? [{ label: "Open", icon: FolderOpenIcon, onSelect: () => open(item) }]
      : [
          { label: "Preview", icon: ViewIcon, onSelect: () => open(item) },
          {
            label: "Download",
            icon: Download01Icon,
            onSelect: () =>
              (window.location.href = downloadUrl(source, item.id)),
          },
        ]

  let body: React.ReactNode
  if (listing.isLoading) {
    body = <Skeleton className="m-4 h-40" />
  } else if (listing.error || !data) {
    body = (
      <Empty className="mt-16">
        <EmptyHeader>
          <EmptyTitle>Link unavailable</EmptyTitle>
          <EmptyDescription>
            {errorMessage(
              listing.error,
              "This link does not exist or has expired."
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  } else if (data.locked) {
    body = <Unlock token={token} ownerName={data.ownerName} />
  } else if (data.root?.type === "file") {
    const file = data.root
    body = (
      <Empty className="mt-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileIcon kind={fileKind(file)} />
          </EmptyMedia>
          <EmptyTitle className="break-all">{file.name}</EmptyTitle>
          <EmptyDescription>
            Shared by {data.ownerName} · {formatBytes(file.size)}
          </EmptyDescription>
        </EmptyHeader>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPreviewIndex(0)}>
            <HugeiconsIcon icon={ViewIcon} />
            Preview
          </Button>
          <Button
            nativeButton={false}
            render={<a href={downloadUrl(source, file.id)} />}
          >
            <HugeiconsIcon icon={Download01Icon} />
            Download
          </Button>
        </div>
      </Empty>
    )
  } else {
    body = (
      <>
        <div className="flex min-h-14 items-center gap-2 px-4">
          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList className="text-base">
              {data.crumbs.map((c, i) => (
                <Fragment key={c.id}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem className="max-w-48">
                    {i === data.crumbs.length - 1 ? (
                      <BreadcrumbPage className="truncate">
                        {c.name}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        className="truncate"
                        render={
                          <Link
                            to="/s/$token"
                            params={{ token }}
                            search={i === 0 ? {} : { folder: c.id }}
                          />
                        }
                      >
                        {c.name}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Shared by {data.ownerName}
          </span>
          <ViewToggle mode={view} onChange={setView} />
        </div>
        <FileBrowser<PublicNode>
          items={data.items}
          view={view}
          thumbnailUrl={(i) => publicThumbnailUrl(token, i.id)}
          onOpen={open}
          menu={menu}
          empty={
            <Empty className="mt-10">
              <EmptyHeader>
                <EmptyTitle>This folder is empty</EmptyTitle>
              </EmptyHeader>
            </Empty>
          }
        />
      </>
    )
  }

  const previewItems = data?.root?.type === "file" ? [data.root] : files

  return (
    <div className="min-h-svh">
      <header className="flex h-14 items-center border-b px-4">
        <Logo />
      </header>
      <main className="mx-auto max-w-6xl">{body}</main>
      <PreviewDialog
        source={source}
        items={previewItems}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setPreviewIndex(null)}
      />
    </div>
  )
}
