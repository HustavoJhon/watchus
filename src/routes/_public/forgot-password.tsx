import { createFileRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AuthLayout } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sendPasswordResetEmail } from '@/lib/auth'
import { errorMessage } from '@/lib/auth/errors'

export const Route = createFileRoute('/_public/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error } = await sendPasswordResetEmail(email)
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(errorMessage(err as { message?: string }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Recuperar contraseña"
      description="Te enviaremos un enlace para cambiarla."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restablecer contraseña</CardTitle>
          <CardDescription>Ingresa el correo de tu cuenta.</CardDescription>
        </CardHeader>
        {sent ? (
          <CardContent>
            <p
              role="status"
              className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary"
            >
              Si existe una cuenta con ese correo, enviamos un enlace para
              restablecer tu contraseña.
            </p>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
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
                {submitting ? 'Enviando…' : 'Enviar enlace'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link
                  to="/login"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Volver a iniciar sesión
                </Link>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </AuthLayout>
  )
}
