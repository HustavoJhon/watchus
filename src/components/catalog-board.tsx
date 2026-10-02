import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from 'lucide-react'
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
import { TitleCard, type CatalogItem } from '@/components/catalog'
import { cn } from '@/lib/utils'

/**
 * Sortable grid of the shared household watchlist (Phase 9). `items` is the
 * filtered subset in display order; `onMove(from, to)` receives the positions
 * inside that subset and the caller resolves the full household order via
 * reorderWithSubset.
 */
export function ReorderBoard({
  items,
  onMove,
}: {
  items: CatalogItem[]
  onMove: (from: number, to: number) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = items.findIndex((item) => item.title.id === active.id)
    const to = items.findIndex((item) => item.title.id === over.id)
    if (from === -1 || to === -1) return
    onMove(from, to)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.title.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item, index) => (
            <SortableCard
              key={item.title.id}
              item={item}
              index={index}
              featured={index === 0}
              canMoveUp={index > 0}
              canMoveDown={index < items.length - 1}
              onMove={onMove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableCard({
  item,
  index,
  featured,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  item: CatalogItem
  index: number
  /** Highlights the first pending item («lo próximo por ver»). */
  featured?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (from: number, to: number) => void
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
      className={cn(
        'rounded-lg',
        isDragging && 'z-10 opacity-90',
        featured && 'ring-1 ring-favorite/50',
      )}
    >
      <TitleCard
        item={item}
        position={item.watchlistPosition}
        menu={
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="bg-background/80 backdrop-blur-sm"
              disabled={!canMoveUp}
              aria-label="Subir en la lista"
              onClick={() => onMove(index, index - 1)}
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
              onClick={() => onMove(index, index + 1)}
            >
              <ArrowDownIcon />
            </Button>
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
      />
    </div>
  )
}
