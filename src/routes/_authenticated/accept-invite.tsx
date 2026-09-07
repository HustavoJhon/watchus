import { createFileRoute } from '@tanstack/react-router'
import { Navigate, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AuthLayout } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { acceptInvitationCode } from '@/lib/auth/local'
import { toUserMessage } from '@/lib/auth/errors'
import { queryKeys } from '@/lib/queries'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/_authenticated/accept-invite')({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === 'string' ? search.code : undefined,
  }),
  component: AcceptInvitePage,
})

function AcceptInvitePage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const { code } = Route.useSearch()

  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    async function accept() {
      try {
        const { data, error } = await acceptInvitationCode(code ?? '')
        if (error) throw error
        if (!data) throw new Error('No se pudo unir al hogar.')
        await queryClient.invalidateQueries({
          queryKey: queryKeys.profile(auth.user?.id ?? ''),
        })
        setDone(true)
      } catch (err) {
        setError(toUserMessage((err as { message?: string }).message))
      } finally {
        setBusy(false)
      }
    }

    void accept()
  }, [auth.user?.id, code, queryClient])

  if (done) {
    return <Navigate to="/" />
  }

  if (!code) {
    return (
      <AuthLayout title="Invitación">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CardDescription>
              Este enlace de invitación no incluye un código válido.
            </CardDescription>
            <Button asChild className="w-full">
              <Link to="/">Ir a WatchUs</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Uniéndote al hogar">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardDescription>
            {busy
              ? 'Procesando el código de invitación…'
              : error
                ? error
                : 'Todo listo.'}
          </CardDescription>
          {error ? (
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Ir a WatchUs</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
