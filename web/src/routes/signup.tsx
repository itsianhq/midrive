import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth-card"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { $api } from "@/lib/api/client"
import { authClient } from "@/lib/auth-client"

export const Route = createFileRoute("/signup")({
  component: SignupPage,
})

function SignupPage() {
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
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    })
    setPending(false)
    if (error) return setError(error.message ?? "Could not create account")
    await queryClient.invalidateQueries()
    navigate({ to: "/drive" })
  }

  const signInLink = (
    <>
      Already have an account?{" "}
      <Link
        to="/login"
        search={{}}
        className="font-medium text-foreground underline underline-offset-4"
      >
        Sign in
      </Link>
    </>
  )

  if (config.data && !config.data.signupEnabled) {
    return (
      <AuthCard
        title="Sign-ups are closed"
        description="Ask an administrator to create an account for you."
        footer={signInLink}
      >
        <Button
          className="w-full"
          variant="outline"
          nativeButton={false}
          render={<Link to="/login" search={{}} />}
        >
          Back to sign in
        </Button>
      </AuthCard>
    )
  }

  const setup = config.data?.needsSetup
  return (
    <AuthCard
      title={setup ? "Create the admin account" : "Create an account"}
      footer={!setup && signInLink}
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              required
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <FieldDescription>At least 8 characters.</FieldDescription>
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Spinner />}
            Create account
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
