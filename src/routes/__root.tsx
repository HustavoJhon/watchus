import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
})

function RootComponent() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

/** Friendly fallback for unknown routes or missing match params. */
function NotFoundPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="flex w-full max-w-sm flex-col items-center gap-2 bg-muted/40 p-8 text-center">
        <p className="text-3xl font-bold">404</p>
        <p className="text-sm text-muted-foreground">
          Esta página no existe o el enlace no es válido.
        </p>
        <Button asChild className="mt-2">
          <Link to="/">Ir al inicio</Link>
        </Button>
      </Card>
    </div>
  )
}

/**
 * Last-resort render error boundary: shows a comprehensible message instead
 * of a blank screen or a raw stack trace. Technical details stay in the
 * console only.
 */
function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error)

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="flex w-full max-w-sm flex-col items-center gap-2 bg-muted/40 p-8 text-center">
        <p className="text-base font-semibold">Algo salió mal</p>
        <p className="text-sm text-muted-foreground">
          Intenta recargar la página. Si el problema continúa, vuelve más tarde.
        </p>
        <Button className="mt-2" onClick={() => void reset()}>
          Reintentar
        </Button>
      </Card>
    </div>
  )
}
