import { createFileRoute } from '@tanstack/react-router'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { AuthLayout } from '@/components/auth/auth-layout'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAuth, signOut, updateUserPassword } from '@/lib/auth'
import { errorMessage } from '@/lib/auth/errors'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    recovery: search.recovery != null && search.recovery !== 'false',
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const recovery = Route.useSearch().recovery

  if (!recovery) {
    return <NoSessionCard message="Este enlace de recuperación no es válido." />
  }

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (auth.status !== 'authenticated') {
    return (
      <NoSessionCard message="La sesión de recuperación no está activa. Solicita un nuevo enlace." />
    )
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await updateUserPassword(password)
      if (error) throw error
      await signOut()
      navigate({ to: '/login' })
    } catch (err) {
      setError(errorMessage(err as { message?: string }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Nueva contraseña"
      description="Define la contraseña de tu cuenta."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cambiar contraseña</CardTitle>
          <CardDescription>Usa al menos 6 caracteres.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password-confirm">Confirmar contraseña</Label>
              <PasswordInput
                id="password-confirm"
                autoComplete="new-password"
                placeholder="••••••••"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                required
              />
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  )
}

function NoSessionCard({ message }: { message: string }) {
  return (
    <AuthLayout title="Recuperar contraseña">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Solicitar nuevo enlace</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
