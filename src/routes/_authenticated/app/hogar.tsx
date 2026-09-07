import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CopyIcon, RefreshCwIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { generateInvitationCode } from '@/lib/auth/local'
import { toUserMessage } from '@/lib/auth/errors'
import { queryKeys, useHouseholdContext } from '@/lib/queries'

export const Route = createFileRoute('/_authenticated/app/hogar')({
  component: HouseholdPage,
})

function HouseholdPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const { profile, household, members, secondMember, isLoading } =
    useHouseholdContext(auth.user)

  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando tu hogar…</p>
  }

  if (!profile?.household_id) {
    return <Navigate to="/onboarding" />
  }

  if (!household) {
    return (
      <p className="text-sm text-muted-foreground">
        No encontramos tu hogar. Recarga la página o intenta de nuevo.
      </p>
    )
  }

  const inviteLink = `${window.location.origin}/accept-invite?code=${household.join_code}`
  const householdId = household.id

  async function copy(text: string, kind: 'code' | 'link') {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 2000)
  }

  async function regenerateCode() {
    setError(null)
    setRegenerating(true)
    try {
      const { data, error } = await generateInvitationCode()
      if (error) throw error
      queryClient.invalidateQueries({
        queryKey: queryKeys.household(householdId),
      })
      if (data) {
        // Show the fresh code immediately instead of waiting for the refetch.
        queryClient.setQueryData(queryKeys.household(householdId), data)
      }
    } catch (err) {
      setError(toUserMessage((err as { message?: string }).message))
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{household.name}</CardTitle>
            <CardDescription>
              {secondMember
                ? `${members.length} de 2 integrantes`
                : 'Te falta tu pareja. Comparte el código para unirse.'}
            </CardDescription>
          </div>
          <Badge variant={secondMember ? 'default' : 'secondary'}>
            {secondMember ? 'Completo' : 'Te falta 1'}
          </Badge>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <Avatar>
                  <AvatarFallback>
                    {member.display_name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{member.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Miembro del hogar
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {!secondMember ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invita a tu pareja</CardTitle>
            <CardDescription>
              Comparte el código o el enlace. Solo uno de los dos se mostrará en
              pantalla; podrás generar uno nuevo cuando quieras.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border p-4 font-mono text-2xl font-semibold tracking-[0.3em]">
              {household.join_code}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void copy(household.join_code, 'code')}
                aria-label="Copiar código"
              >
                <CopyIcon />
              </Button>
            </div>
            {copied === 'code' ? (
              <p className="text-center text-xs text-primary">
                Código copiado al portapapeles.
              </p>
            ) : null}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void copy(inviteLink, 'link')}
            >
              <CopyIcon />
              {copied === 'link'
                ? 'Enlace de invitación copiado'
                : 'Copiar enlace de invitación'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => void regenerateCode()}
              disabled={regenerating}
            >
              <RefreshCwIcon
                className={regenerating ? 'animate-spin' : undefined}
              />
              {regenerating ? 'Generando…' : 'Generar nuevo código'}
            </Button>
            {error ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            <p className="text-center text-xs text-muted-foreground">
              El hogar admite exactamente 2 integrantes.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
