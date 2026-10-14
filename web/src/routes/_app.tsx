import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { AppSidebar } from "@/components/app-sidebar"
import { DriveActionsProvider } from "@/components/drive/drive-actions"
import { UploadPanel } from "@/components/drive/upload-panel"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { meQuery } from "@/lib/me"

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(meQuery())
    } catch {
      throw redirect({ to: "/login", search: { redirect: location.href } })
    }
  },
  component: AppLayout,
})

function SearchBox() {
  const current = useRouterState({
    select: (s) =>
      s.location.pathname === "/search"
        ? ((s.location.search as { q?: string }).q ?? "")
        : "",
  })
  // Remount when the URL's query changes so the field mirrors it
  return <SearchForm key={current} initial={current} />
}

function SearchForm({ initial }: { initial: string }) {
  const navigate = useNavigate()
  const [value, setValue] = useState(initial)

  return (
    <form
      className="w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim())
          navigate({ to: "/search", search: { q: value.trim() } })
      }}
    >
      <InputGroup className="h-8">
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search in Drive"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </InputGroup>
    </form>
  )
}

function AppLayout() {
  return (
    <DriveActionsProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur">
            <SidebarTrigger />
            <SearchBox />
          </header>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
      <UploadPanel />
    </DriveActionsProvider>
  )
}
