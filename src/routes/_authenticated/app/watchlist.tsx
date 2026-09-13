import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  HeartIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import { reorderWithSubset } from '@/lib/catalog-order'
import { useCatalog, useCatalogMutations } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { householdWatchlist, watchlistCountLabel } from '@/lib/watchlist'

export const Route = createFileRoute('/_authenticated/app/watchlist')({
  component: WatchlistPage,
})

const FILTERS = [
  { value: 'all', label: 'Todo' },
  { value: 'movie', label: 'Películas' },
  { value: 'tv', label: 'Series' },
] as const

function WatchlistPage() {
  const auth = useAuth()
  const catalogQuery = useCatalog(auth.user)
  const mutations = useCatalogMutations(auth.user)
  const [typeFilter, setTypeFilter] = useState<(typeof FILTERS)[number]['value']>(
    'all',
  )

  const allPending = useMemo(
    () => householdWatchlist(catalogQuery.data ?? []),
    [catalogQuery.data],
  )

  const items = useMemo(
    () =>
      typeFilter === 'all'
        ? allPending
        : allPending.filter((item) => item.title.media_type === typeFilter),
    [allPending, typeFilter],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const reorder = (from: number, to: number) => {
    const orderedIds = reorderWithSubset(
      allPending.map((item) => item.title.id),
      items.map((item) => item.title.id),
      from,
      to,
    )
    mutations.reorder.mutate(orderedIds)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = items.findIndex((item) => item.title.id === active.id)
    const to = items.findIndex((item) => item.title.id === over.id)
    if (from === -1 || to === -1) return
    reorder(from, to)
  }

  const onMove = (titleId: string, delta: -1 | 1) => {
    const from = items.findIndex((item) => item.title.id === titleId)
    if (from === -1) return
    reorder(from, from + delta)
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold">Pendientes del hogar</h1>
        <span className="text-xs text-muted-foreground">
          {watchlistCountLabel(allPending.length)}
        </span>
      </div>

      {allPending.length > 1 ? (
        <div className="flex items-center gap-1">
          {FILTERS.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={typeFilter === filter.value ? 'default' : 'outline'}
              onClick={() => setTypeFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      ) : null}

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
      allPending.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 bg-muted/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no tienen pendientes. Añade títulos desde la búsqueda.
          </p>
          <Button asChild>
            <Link to="/app/search" search={{ q: '' }}>
              Ir a Búsqueda
            </Link>
          </Button>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Arrastra (o usa las flechas) para ordenar la cola compartida.
        </p>
      ) : null}

      {items.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={items.map((item) => item.title.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((item, index) => (
                <SortableTitleCard
                  key={item.title.id}
                  item={item}
                  canMoveUp={index > 0}
                  canMoveDown={index < items.length - 1}
                  onMove={onMove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}
    </div>
  )
}

function SortableTitleCard({
  item,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  item: CatalogItem
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (titleId: string, delta: -1 | 1) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.title.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && 'z-10 opacity-90')}
    >
      <TitleCard
        item={item}
        position={item.watchlistPosition}
        menu={
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="bg-background/80 backdrop-blur-sm"
                disabled={!canMoveUp}
                aria-label="Subir en la lista"
                onClick={() => onMove(item.title.id, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="bg-background/80 backdrop-blur-sm"
                disabled={!canMoveDown}
                aria-label="Bajar en la lista"
                onClick={() => onMove(item.title.id, 1)}
              >
                <ArrowDownIcon />
              </Button>
            </div>
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label="Arrastrar para reordenar"
              className="flex size-8 cursor-grab touch-none items-center justify-center rounded-md bg-background/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted active:cursor-grabbing"
            >
              <GripVerticalIcon className="size-5" />
            </button>
          </div>
        }
        footer={<WatchlistControls item={item} />}
      />
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