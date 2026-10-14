import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  Clock01Icon,
  ComputerIcon,
  Delete02Icon,
  FileUploadIcon,
  FolderAddIcon,
  FolderUploadIcon,
  HardDriveIcon,
  Logout01Icon,
  Moon02Icon,
  PlusSignIcon,
  Settings01Icon,
  StarIcon,
  Sun03Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons"
import { useQueryClient } from "@tanstack/react-query"
import {
  Link,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router"
import { useDriveActions } from "@/components/drive/drive-actions"
import { Logo } from "@/components/logo"
import { useTheme } from "@/components/theme-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { authClient } from "@/lib/auth-client"
import { formatBytes } from "@/lib/format"
import { useMe } from "@/lib/me"

const NAV = [
  { to: "/drive", label: "My Drive", icon: HardDriveIcon },
  { to: "/shared", label: "Shared with me", icon: UserMultipleIcon },
  { to: "/recent", label: "Recent", icon: Clock01Icon },
  { to: "/starred", label: "Starred", icon: StarIcon },
  { to: "/trash", label: "Trash", icon: Delete02Icon },
] as const

function NewMenu() {
  const actions = useDriveActions()
  const { folderId } = useParams({ strict: false })
  const target = folderId ?? null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="lg" className="w-full justify-start shadow-sm" />}
      >
        <HugeiconsIcon icon={PlusSignIcon} />
        New
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        <DropdownMenuItem onClick={() => actions.newFolder(target)}>
          <HugeiconsIcon icon={FolderAddIcon} />
          New folder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => actions.pickFiles(target)}>
          <HugeiconsIcon icon={FileUploadIcon} />
          File upload
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.pickFolder(target)}>
          <HugeiconsIcon icon={FolderUploadIcon} />
          Folder upload
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StorageMeter() {
  const { storage } = useMe()
  const pct = storage.quota
    ? Math.min(100, (storage.used / storage.quota) * 100)
    : 0
  return (
    <div className="grid gap-1.5 px-2 text-xs">
      {storage.quota !== null && <Progress value={pct} />}
      <span className="text-muted-foreground">
        {storage.quota === null
          ? `${formatBytes(storage.used)} used`
          : `${formatBytes(storage.used)} of ${formatBytes(storage.quota)} used`}
      </span>
    </div>
  )
}

function UserMenu() {
  const me = useMe()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const initials = me.user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  async function signOut() {
    await authClient.signOut()
    queryClient.clear()
    navigate({ to: "/login", search: {} })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
        <Avatar className="size-7">
          <AvatarFallback className="text-[0.65rem]">{initials}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate text-xs font-medium">{me.user.name}</span>
          <span className="truncate text-[0.7rem] text-muted-foreground">
            {me.user.email}
          </span>
        </div>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className="size-3.5 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(v) => setTheme(v as typeof theme)}
          >
            <DropdownMenuRadioItem value="light">
              <HugeiconsIcon icon={Sun03Icon} />
              Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <HugeiconsIcon icon={Moon02Icon} />
              Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <HugeiconsIcon icon={ComputerIcon} />
              System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <HugeiconsIcon icon={Logout01Icon} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar() {
  const me = useMe()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isActive = (to: string) =>
    pathname === to || pathname.startsWith(`${to}/`)

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-3">
        <Link to="/drive" className="px-1">
          <Logo />
        </Link>
        <NewMenu />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={isActive(item.to)}
                    render={<Link to={item.to} />}
                  >
                    <HugeiconsIcon icon={item.icon} />
                    {item.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {me.user.role === "admin" && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isActive("/admin")}
                    render={<Link to="/admin" />}
                  >
                    <HugeiconsIcon icon={Settings01Icon} />
                    Admin
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3">
        <StorageMeter />
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
