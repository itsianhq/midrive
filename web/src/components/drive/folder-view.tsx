import { Fragment } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CloudUploadIcon,
  FolderAddIcon,
  Share08Icon,
} from "@hugeicons/core-free-icons"
import { Link } from "@tanstack/react-router"
import { PageHeader } from "@/components/page-header"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { $api, errorMessage, thumbnailUrl } from "@/lib/api/client"
import type { DriveNode } from "@/lib/api/types"
import { useMe } from "@/lib/me"
import { useDriveActions } from "./drive-actions"
import { FileBrowser, useViewMode, ViewToggle } from "./file-browser"
import { useItemMenu } from "./item-menu"
import { UploadDropZone } from "./upload-dropzone"

function IconAction({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: typeof FolderAddIcon
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={onClick}
          />
        }
      >
        <HugeiconsIcon icon={icon} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function FolderView({ folderId }: { folderId: string | null }) {
  const me = useMe()
  const actions = useDriveActions()
  const [view, setView] = useViewMode()
  const listing = $api.useQuery("get", "/drive", {
    params: { query: folderId ? { folderId } : {} },
  })
  const data = listing.data
  const role = data?.role ?? "viewer"
  const canEdit = role !== "viewer"
  const menu = useItemMenu("drive", role)

  if (listing.error) {
    return (
      <Empty className="mt-16">
        <EmptyHeader>
          <EmptyTitle>Folder unavailable</EmptyTitle>
          <EmptyDescription>{errorMessage(listing.error)}</EmptyDescription>
        </EmptyHeader>
        <Button nativeButton={false} render={<Link to="/drive" />}>
          Back to My Drive
        </Button>
      </Empty>
    )
  }

  const crumbs = data?.crumbs ?? []
  const items = data?.items ?? []

  const title = (
    <Breadcrumb>
      <BreadcrumbList className="text-base">
        <BreadcrumbItem>
          {folderId ? (
            <BreadcrumbLink
              render={
                data?.viaShare ? <Link to="/shared" /> : <Link to="/drive" />
              }
            >
              {data?.viaShare ? "Shared with me" : "My Drive"}
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>My Drive</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {crumbs.map((c, i) => (
          <Fragment key={c.id}>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="max-w-48">
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage className="truncate">{c.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  className="truncate"
                  render={
                    <Link to="/drive/$folderId" params={{ folderId: c.id }} />
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
  )

  return (
    <UploadDropZone
      parentId={folderId}
      enabled={canEdit}
      className="flex flex-1 flex-col"
    >
      <PageHeader
        title={title}
        actions={
          <>
            {canEdit && (
              <>
                <IconAction
                  label="New folder"
                  icon={FolderAddIcon}
                  onClick={() => actions.newFolder(folderId)}
                />
                <IconAction
                  label="Upload files"
                  icon={CloudUploadIcon}
                  onClick={() => actions.pickFiles(folderId)}
                />
              </>
            )}
            {canEdit && data?.folder && (
              <IconAction
                label="Share folder"
                icon={Share08Icon}
                onClick={() => actions.share(data.folder!)}
              />
            )}
            <ViewToggle mode={view} onChange={setView} />
          </>
        }
      />
      <div className="flex-1">
        <FileBrowser<DriveNode>
          items={items}
          loading={listing.isLoading}
          view={view}
          thumbnailUrl={(i) => thumbnailUrl(i.id)}
          onOpen={(i) => actions.open(i, items)}
          menu={(i) => menu(i, items)}
          ownerLabel={(i) => (i.ownerId === me.user.id ? "me" : i.ownerName)}
          canDrag={() => canEdit}
          onDropIntoFolder={canEdit ? actions.moveInto : undefined}
          empty={
            <Empty className="mt-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={CloudUploadIcon} />
                </EmptyMedia>
                <EmptyTitle>
                  {folderId ? "This folder is empty" : "Welcome to your Drive"}
                </EmptyTitle>
                <EmptyDescription>
                  {canEdit
                    ? "Drop files or folders here, or use the New button."
                    : "Nothing has been added here yet."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      </div>
    </UploadDropZone>
  )
}
