import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Delete02Icon,
  Link01Icon,
  LockPasswordIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { $api } from "@/lib/api/client"
import type { DriveNode } from "@/lib/api/types"
import { formatDateTime } from "@/lib/format"
import { useMe } from "@/lib/me"

const ROLE_ITEMS = [
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
] as const

const EXPIRY_ITEMS = [
  { value: "never", label: "Never expires" },
  { value: "1", label: "Expires in 1 day" },
  { value: "7", label: "Expires in 7 days" },
  { value: "30", label: "Expires in 30 days" },
]

type ShareRole = "viewer" | "editor"

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function Person({
  name,
  email,
  isYou,
  children,
}: {
  name: string
  email: string
  isYou?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-[0.65rem]">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">
          {name}
          {isYou && <span className="text-muted-foreground"> (you)</span>}
        </div>
        <div className="truncate text-xs text-muted-foreground">{email}</div>
      </div>
      {children}
    </div>
  )
}

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: ShareRole
  onChange: (role: ShareRole) => void
  disabled?: boolean
}) {
  return (
    <Select
      items={ROLE_ITEMS}
      value={value}
      onValueChange={(v) => v && onChange(v as ShareRole)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-24">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_ITEMS.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function PeopleSection({
  node,
  isOwner,
}: {
  node: DriveNode
  isOwner: boolean
}) {
  const me = useMe()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<ShareRole>("viewer")
  const params = { params: { path: { id: node.id } } }
  const shares = $api.useQuery("get", "/nodes/{id}/shares", params)
  const create = $api.useMutation("post", "/nodes/{id}/shares")
  const update = $api.useMutation("patch", "/shares/{id}")
  const remove = $api.useMutation("delete", "/shares/{id}")

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    await create.mutateAsync({ ...params, body: { email: email.trim(), role } })
    toast.success(`Shared with ${email.trim()}`)
    setEmail("")
  }

  return (
    <div className="grid gap-3">
      <form onSubmit={add} className="flex gap-2">
        <Input
          type="email"
          placeholder="Add people by email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        {/* Editors can only invite viewers */}
        <RoleSelect value={role} onChange={setRole} disabled={!isOwner} />
        <Button type="submit" disabled={create.isPending || !email.trim()}>
          {create.isPending && <Spinner />}
          Share
        </Button>
      </form>

      <div className="text-xs font-medium text-muted-foreground">
        People with access
      </div>
      <div className="grid max-h-56 gap-3 overflow-y-auto">
        {shares.isLoading && <Skeleton className="h-8" />}
        {shares.data && (
          <>
            <Person
              name={shares.data.owner.name}
              isYou={shares.data.owner.id === me.user.id}
              email={shares.data.owner.email}
            >
              <Badge variant="secondary">Owner</Badge>
            </Person>
            {shares.data.items.map((s) => (
              <Person
                key={s.id}
                name={s.user.name}
                isYou={s.user.id === me.user.id}
                email={s.user.email}
              >
                <RoleSelect
                  value={s.role}
                  disabled={!isOwner}
                  onChange={(r) =>
                    update.mutate({
                      params: { path: { id: s.id } },
                      body: { role: r },
                    })
                  }
                />
                {(isOwner ||
                  (s.sharedById === me.user.id && s.role === "viewer")) && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${s.user.name}`}
                    onClick={() =>
                      remove.mutate({ params: { path: { id: s.id } } })
                    }
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                )}
              </Person>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function LinksSection({ node }: { node: DriveNode }) {
  const params = { params: { path: { id: node.id } } }
  const links = $api.useQuery("get", "/nodes/{id}/links", params)
  const create = $api.useMutation("post", "/nodes/{id}/links")
  const remove = $api.useMutation("delete", "/links/{id}")
  const [password, setPassword] = useState("")
  const [expiry, setExpiry] = useState("never")

  const linkUrl = (token: string) => `${window.location.origin}/s/${token}`

  async function copy(token: string) {
    await navigator.clipboard.writeText(linkUrl(token))
    toast.success("Link copied")
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const days = expiry === "never" ? null : Number(expiry)
    const link = await create.mutateAsync({
      ...params,
      body: {
        password: password || undefined,
        expiresAt: days
          ? new Date(Date.now() + days * 86_400_000).toISOString()
          : undefined,
      },
    })
    setPassword("")
    await copy(link.token).catch(() => {})
  }

  return (
    <div className="grid gap-3">
      <div className="text-xs font-medium text-muted-foreground">
        Public links
      </div>
      <div className="grid gap-2">
        {links.data?.items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No links yet. Anyone with a link can view and download.
          </p>
        )}
        {links.data?.items.map((l) => (
          <div key={l.id} className="flex items-center gap-2">
            <HugeiconsIcon
              icon={l.hasPassword ? LockPasswordIcon : Link01Icon}
              className="size-4 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0 flex-1">
              <Input
                readOnly
                value={linkUrl(l.token)}
                onFocus={(e) => e.target.select()}
                className="h-7"
              />
              <div className="mt-1 text-[0.7rem] text-muted-foreground">
                {l.hasPassword ? "Password protected · " : ""}
                {l.expired
                  ? "Expired"
                  : l.expiresAt
                    ? `Expires ${formatDateTime(l.expiresAt)}`
                    : "Never expires"}
              </div>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Copy link"
              onClick={() => copy(l.token)}
            >
              <HugeiconsIcon icon={Copy01Icon} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete link"
              onClick={() => remove.mutate({ params: { path: { id: l.id } } })}
            >
              <HugeiconsIcon icon={Delete02Icon} />
            </Button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <Input
          type="password"
          placeholder="Password (optional)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="min-w-36 flex-1"
        />
        <Select
          items={EXPIRY_ITEMS}
          value={expiry}
          onValueChange={(v) => v && setExpiry(v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPIRY_ITEMS.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" disabled={create.isPending}>
          {create.isPending ? <Spinner /> : <HugeiconsIcon icon={Link01Icon} />}
          Create link
        </Button>
      </form>
    </div>
  )
}

export function ShareDialog({
  node,
  onOpenChange,
}: {
  node: DriveNode | null
  onOpenChange: (open: boolean) => void
}) {
  const me = useMe()
  const isOwner = node?.ownerId === me.user.id
  return (
    <Dialog open={!!node} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {node && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-6">
                Share “{node.name}”
              </DialogTitle>
              <DialogDescription>
                People you add can find it under “Shared with me”.
                {node.type === "folder" &&
                  " Access includes everything inside."}
              </DialogDescription>
            </DialogHeader>
            <PeopleSection node={node} isOwner={isOwner} />
            {/* Public links bypass sharing entirely, so only the owner manages them */}
            {isOwner && (
              <>
                <Separator />
                <LinksSection node={node} />
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
