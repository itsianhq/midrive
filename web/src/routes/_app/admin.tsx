import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  HardDriveIcon,
  MoreVerticalIcon,
  UserAdd01Icon,
  UserBlock01Icon,
  UserCheck01Icon,
} from "@hugeicons/core-free-icons"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/drive/simple-dialogs"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { $api } from "@/lib/api/client"
import type { AdminUser, Settings } from "@/lib/api/types"
import { formatBytes, formatDate, GB } from "@/lib/format"
import { meQuery, useMe } from "@/lib/me"

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery())
    if (me.user.role !== "admin") throw redirect({ to: "/drive" })
  },
  component: AdminPage,
})

const ROLE_ITEMS = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
]

/** "" ⇄ null (unlimited / default), otherwise GB ⇄ bytes. */
const toGb = (bytes: number | null) =>
  bytes === null ? "" : String(+(bytes / GB).toFixed(2))
const fromGb = (value: string) =>
  value.trim() === "" ? null : Math.round(Number(value) * GB)

function SettingsCard() {
  const settings = $api.useQuery("get", "/admin/settings")
  if (!settings.data) return <Skeleton className="h-48" />
  const s = settings.data
  return (
    <SettingsForm
      key={`${s.defaultQuota}:${s.trashRetentionDays}`}
      settings={s}
    />
  )
}

function SettingsForm({ settings }: { settings: Settings }) {
  const save = $api.useMutation("patch", "/admin/settings")
  const [quota, setQuota] = useState(toGb(settings.defaultQuota))
  const [retention, setRetention] = useState(
    String(settings.trashRetentionDays)
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await save.mutateAsync({
      body: {
        defaultQuota: fromGb(quota),
        trashRetentionDays: Number(retention),
      },
    })
    toast.success("Settings saved")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instance settings</CardTitle>
        <CardDescription>
          Applies to every account on this MiDrive instance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="signup">Allow sign-ups</FieldLabel>
                <FieldDescription>
                  When off, only admins can create accounts.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="signup"
                checked={settings.signupEnabled}
                onCheckedChange={(checked) =>
                  save.mutate({ body: { signupEnabled: checked } })
                }
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="quota">
                  Default storage quota (GB)
                </FieldLabel>
                <Input
                  id="quota"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Unlimited"
                  value={quota}
                  onChange={(e) => setQuota(e.target.value)}
                />
                <FieldDescription>Leave empty for unlimited.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="retention">
                  Keep trash for (days)
                </FieldLabel>
                <Input
                  id="retention"
                  type="number"
                  min={1}
                  max={3650}
                  required
                  value={retention}
                  onChange={(e) => setRetention(e.target.value)}
                />
              </Field>
            </div>
            <div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Spinner />}
                Save
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const create = $api.useMutation("post", "/admin/users")
  const [role, setRole] = useState<"user" | "admin">("user")

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    await create.mutateAsync({
      body: {
        name: String(form.get("name")),
        email: String(form.get("email")),
        password: String(form.get("password")),
        role,
      },
    })
    toast.success("User created")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Share the password with them; they can sign in right away.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-name">Name</FieldLabel>
              <Input id="new-name" name="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-email">Email</FieldLabel>
              <Input id="new-email" name="email" type="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-password">Password</FieldLabel>
              <Input
                id="new-password"
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <Select
                items={ROLE_ITEMS}
                value={role}
                onValueChange={(v) => v && setRole(v as "user" | "admin")}
              >
                <SelectTrigger className="w-full">
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
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Spinner />}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function QuotaDialog({
  user,
  onOpenChange,
}: {
  user: AdminUser | null
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {user && (
          <QuotaForm key={user.id} user={user} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function QuotaForm({
  user,
  onOpenChange,
}: {
  user: AdminUser
  onOpenChange: (o: boolean) => void
}) {
  const update = $api.useMutation("patch", "/admin/users/{id}")
  const [value, setValue] = useState(toGb(user.storageQuota))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await update.mutateAsync({
      params: { path: { id: user.id } },
      body: { storageQuota: fromGb(value) },
    })
    onOpenChange(false)
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Storage quota</DialogTitle>
        <DialogDescription>
          {user.name} currently uses {formatBytes(user.used)}.
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="user-quota">Quota (GB)</FieldLabel>
        <Input
          id="user-quota"
          type="number"
          min={0}
          step="any"
          placeholder="Instance default"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <FieldDescription>
          Leave empty to use the instance default.
        </FieldDescription>
      </Field>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending && <Spinner />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

function UsersCard() {
  const me = useMe()
  const users = $api.useQuery("get", "/admin/users")
  const settings = $api.useQuery("get", "/admin/settings")
  const update = $api.useMutation("patch", "/admin/users/{id}")
  const remove = $api.useMutation("delete", "/admin/users/{id}")
  const [creating, setCreating] = useState(false)
  const [quotaUser, setQuotaUser] = useState<AdminUser | null>(null)
  const [deleting, setDeleting] = useState<AdminUser | null>(null)

  const defaultQuota = settings.data?.defaultQuota ?? null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1">
          <CardTitle>Users</CardTitle>
          <CardDescription>
            {users.data ? `${users.data.items.length} accounts` : "Loading…"}
          </CardDescription>
        </div>
        <Button onClick={() => setCreating(true)}>
          <HugeiconsIcon icon={UserAdd01Icon} />
          Add user
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="w-28">Role</TableHead>
              <TableHead className="w-56">Storage</TableHead>
              <TableHead className="hidden w-28 md:table-cell">
                Joined
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.data?.items.map((u) => {
              const isMe = u.id === me.user.id
              const quota = u.storageQuota ?? defaultQuota
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {u.name}{" "}
                          {isMe && (
                            <span className="text-muted-foreground">(you)</span>
                          )}
                        </div>
                        <div className="truncate text-muted-foreground">
                          {u.email}
                        </div>
                      </div>
                      {u.banned && <Badge variant="destructive">Banned</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      items={ROLE_ITEMS}
                      value={u.role}
                      disabled={isMe}
                      onValueChange={(role) =>
                        role &&
                        update.mutate({
                          params: { path: { id: u.id } },
                          body: { role: role as "user" | "admin" },
                        })
                      }
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
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-1">
                      {quota !== null && (
                        <Progress
                          value={Math.min(
                            100,
                            (u.used / Math.max(quota, 1)) * 100
                          )}
                        />
                      )}
                      <span className="text-muted-foreground">
                        {formatBytes(u.used)} /{" "}
                        {quota === null ? "unlimited" : formatBytes(quota)}
                        {u.storageQuota === null &&
                          quota !== null &&
                          " (default)"}{" "}
                        · {u.fileCount} files
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDate(u.createdAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Actions for ${u.name}`}
                          />
                        }
                      >
                        <HugeiconsIcon icon={MoreVerticalIcon} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => setQuotaUser(u)}>
                          <HugeiconsIcon icon={HardDriveIcon} />
                          Set quota
                        </DropdownMenuItem>
                        {!isMe && (
                          <>
                            <DropdownMenuItem
                              onClick={() =>
                                update.mutate({
                                  params: { path: { id: u.id } },
                                  body: { banned: !u.banned },
                                })
                              }
                            >
                              <HugeiconsIcon
                                icon={
                                  u.banned ? UserCheck01Icon : UserBlock01Icon
                                }
                              />
                              {u.banned ? "Unban" : "Ban"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleting(u)}
                            >
                              <HugeiconsIcon icon={Delete02Icon} />
                              Delete user
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {users.isLoading && <Skeleton className="mt-2 h-10" />}
      </CardContent>

      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      <QuotaDialog
        user={quotaUser}
        onOpenChange={(o) => !o && setQuotaUser(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Their account and all of their files will be permanently deleted."
        confirmLabel="Delete user"
        destructive
        onConfirm={() =>
          deleting && remove.mutate({ params: { path: { id: deleting.id } } })
        }
      />
    </Card>
  )
}

function AdminPage() {
  return (
    <>
      <PageHeader title="Admin" />
      <div className="grid max-w-5xl gap-4 px-4 pb-8">
        <SettingsCard />
        <UsersCard />
      </div>
    </>
  )
}
