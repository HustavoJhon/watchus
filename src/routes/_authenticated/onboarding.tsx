import { createFileRoute } from '@tanstack/react-router'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
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
import { useQueryClient } from '@tanstack/react-query'
import { acceptInvitationCode, createHousehold } from '@/lib/auth/local'
import { toUserMessage } from '@/lib/auth/errors'
import { queryKeys } from '@/lib/queries'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/_authenticated/onboarding')({
  component: OnboardingPage,
})

function OnboardingPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [householdName, setHouseholdName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)

  async function invalidateAndGoHome() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.profile(auth.user?.id ?? ''),
    })
    await queryClient.invalidateQueries({
      queryKey: queryKeys.householdProfiles(undefined),
    })
    navigate({ to: '/' })
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy('create')
    try {
      const { data, error } = await createHousehold(householdName)
      if (error) throw error
      if (!data) throw new Error('No se pudo crear el hogar.')
      await invalidateAndGoHome()
    } catch (err) {
      setError(toUserMessage((err as { message?: string }).message))
    } finally {
      setBusy(null)
    }
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy('join')
    try {
      const { data, error } = await acceptInvitationCode(joinCode)
      if (error) throw error
      if (!data) throw new Error('No se pudo unir al hogar.')
      await invalidateAndGoHome()
    } catch (err) {
      setError(toUserMessage((err as { message?: string }).message))
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-semibold">Bienvenido a WatchUs</h1>
          <p className="text-sm text-muted-foreground">
            Crea un hogar o únete al de tu pareja con su código.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Crear un hogar</CardTitle>
              <CardDescription>
                Tu pareja se unirá luego con el código.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleCreate}>
              <CardContent>
                <Label htmlFor="household-name" className="sr-only">
                  Nombre del hogar
                </Label>
                <Input
                  id="household-name"
                  placeholder="Nuestro hogar"
                  value={householdName}
                  onChange={(event) => setHouseholdName(event.target.value)}
                  required
                />
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy !== null}
                >
                  {busy === 'create' ? 'Creando…' : 'Crear hogar'}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Unirme a un hogar</CardTitle>
              <CardDescription>
                Ingresa el código que te compartió tu pareja.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleJoin}>
              <CardContent>
                <Label htmlFor="join-code" className="sr-only">
                  Código de invitación
                </Label>
                <Input
                  id="join-code"
                  placeholder="A1B2C3D4"
                  className="font-mono uppercase"
                  value={joinCode}
                  onChange={(event) =>
                    setJoinCode(event.target.value.toUpperCase())
                  }
                  maxLength={8}
                  required
                />
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={busy !== null}
                >
                  {busy === 'join' ? 'Uniéndome…' : 'Unirme'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </main>
  )
}
