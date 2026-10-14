import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { AuthCard } from "@/components/auth-card"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { $api } from "@/lib/api/client"
import { authClient } from "@/lib/auth-client"

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const config = $api.useQuery("get", "/config")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(null)
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not sign in")
    await queryClient.invalidateQueries()
    navigate({ to: redirect ?? "/drive" })
  }

  if (config.data?.needsSetup) {
    return (
      <AuthCard
        title="Welcome to MiDrive"
        description="No accounts exist yet. Create the admin account to get started."
      >
        <Button
          className="w-full"
          nativeButton={false}
          render={<Link to="/signup" />}
        >
          Create admin account
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Sign in"
      footer={
        config.data?.signupEnabled && (
          <>
            No account?{" "}
            <Link
              to="/signup"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Sign up
            </Link>
          </>
        )
      }
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Spinner />}
            Sign in
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
