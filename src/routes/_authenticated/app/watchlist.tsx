import { createFileRoute, Link } from '@tanstack/react-router'
import { HeartIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  RatingPicker,
  StatusPicker,
  TitleCard,
  type CatalogItem,
} from '@/components/catalog'
import { useAuth } from '@/lib/auth'
import { useCatalog, useCatalogMutations } from '@/lib/queries'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/app/watchlist')({
  component: WatchlistPage,
})

function WatchlistPage() {
  const auth = useAuth()
  const catalogQuery = useCatalog(auth.user)

  const items =
    catalogQuery.data?.filter((item) => item.ownStatus === 'watchlist') ?? []

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold">Pendientes</h1>
        <span className="text-xs text-muted-foreground">
          {items.length} título{items.length === 1 ? '' : 's'} en tu lista
        </span>
      </div>

      {catalogQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[2/3] rounded-lg" />
          ))}
        </div>
      ) : null}

      {catalogQuery.isError ? (
        <Card className="flex flex-col items-start gap-2 bg-destructive/10 p-4">
          <p role="alert" className="text-sm text-destructive">
            No se pudo cargar tu lista de pendientes.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void catalogQuery.refetch()}
          >
            Reintentar
          </Button>
        </Card>
      ) : null}

      {!catalogQuery.isLoading &&
      !catalogQuery.isError &&
      items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 bg-muted/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no tienes pendientes. Añade títulos desde la búsqueda.
          </p>
          <Button asChild>
            <Link to="/app/search" search={{ q: '' }}>
              Ir a Búsqueda
            </Link>
          </Button>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <div
          className={cn(
            'grid gap-4',
            'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
          )}
        >
          {items.map((item) => (
            <TitleCard
              key={item.title.id}
              item={item}
              footer={<WatchlistControls item={item} />}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function WatchlistControls({ item }: { item: CatalogItem }) {
  const auth = useAuth()
  const mutations = useCatalogMutations(auth.user)
  const busy =
    mutations.setStatus.isPending ||
    mutations.clearStatus.isPending ||
    mutations.rate.isPending ||
    mutations.favorite.isPending

  return (
    <div className="flex flex-col gap-2">
      <StatusPicker
        status={item.ownStatus}
        disabled={busy}
        onChange={(status) => {
          if (status === null) {
            mutations.clearStatus.mutate(item.title.id)
          } else {
            mutations.setStatus.mutate({ titleId: item.title.id, status })
          }
        }}
      />
      <div className="flex items-center justify-between gap-1">
        <RatingPicker
          rating={item.ownRating}
          disabled={busy}
          onChange={(rating) =>
            mutations.rate.mutate({ titleId: item.title.id, rating })
          }
        />
        <Button
          type="button"
          size="icon-sm"
          variant={item.ownFavorite ? 'default' : 'outline'}
          disabled={busy}
          aria-label={
            item.ownFavorite ? 'Quitar de favoritos' : 'Marcar favorito'
          }
          onClick={() =>
            mutations.favorite.mutate({
              titleId: item.title.id,
              favorite: !item.ownFavorite,
            })
          }
        >
          <HeartIcon
            className={item.ownFavorite ? 'fill-current' : undefined}
          />
        </Button>
      </div>
    </div>
  )
}
