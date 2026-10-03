import { useState } from 'react'
import { ChevronDownIcon, HeartIcon, SlidersHorizontalIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type {
  CatalogFilters,
  MediaTypeFilter,
  ScopeFilter,
  StatusFilter,
} from '@/lib/catalog-filter'
import { scopeFilterApplies } from '@/lib/catalog-filter'
import { cn } from '@/lib/utils'

const typeOptions: Array<{ value: MediaTypeFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'movie', label: 'Películas' },
  { value: 'tv', label: 'Series' },
]

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'none', label: 'Sin estado' },
  { value: 'watchlist', label: 'Pendientes' },
  { value: 'watching', label: 'Viendo' },
  { value: 'watched', label: 'Vistos' },
]

const scopeOptions: Array<{ value: ScopeFilter; label: string }> = [
  { value: 'all', label: 'Ambas listas' },
  { value: 'shared', label: 'Hogar' },
  { value: 'personal', label: 'Solo para mí' },
]

/**
 * Count of active filters (type/status/scope/favorites), excluding the search
 * box. The scope only counts while it actually narrows something, i.e. when the
 * status filter is «Pendientes».
 */
function activeFilterCount(filters: CatalogFilters): number {
  let count = 0
  if (filters.type !== 'all') count += 1
  if (filters.status !== 'all') count += 1
  if (filters.favorites !== 'all') count += 1
  if (scopeFilterApplies(filters)) count += 1
  return count
}

export function CatalogFilters({
  filters,
  onFiltersChange,
}: {
  filters: CatalogFilters
  onFiltersChange: (patch: Partial<CatalogFilters>) => void
}) {
  const active = activeFilterCount(filters)
  const clearable = active > 0 || filters.query.trim() !== ''
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="hidden items-center gap-1.5 md:flex">
        <FilterControls
          filters={filters}
          onFiltersChange={onFiltersChange}
          clearable={clearable}
        />
      </div>

      <div className="md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="relative gap-1.5"
            >
              <SlidersHorizontalIcon />
              Filtros
              {active > 0 ? (
                <Badge className="ml-1 bg-primary px-1.5 py-0 text-primary-foreground">
                  {active}
                </Badge>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-5 overflow-y-auto pt-2 pb-2">
              <FilterControls
                filters={filters}
                onFiltersChange={onFiltersChange}
                clearable={clearable}
                onDone={() => setOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}

function FilterControls({
  filters,
  onFiltersChange,
  clearable,
  onDone,
}: {
  filters: CatalogFilters
  onFiltersChange: (patch: Partial<CatalogFilters>) => void
  clearable: boolean
  onDone?: () => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {typeOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filters.type === option.value ? 'default' : 'outline'}
            aria-pressed={filters.type === option.value}
            onClick={() => {
              onFiltersChange({ type: option.value })
              onDone?.()
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <StatusMenu filters={filters} onChange={onFiltersChange} />

      {/* The scope only means something while looking at pending titles. */}
      {filters.status === 'watchlist' ? (
        <ScopeMenu filters={filters} onChange={onFiltersChange} />
      ) : null}

      <FavoriteToggle filters={filters} onChange={onFiltersChange} />

      {clearable ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => {
            onFiltersChange({
              type: 'all',
              status: 'all',
              favorites: 'all',
              scope: 'all',
            })
            onDone?.()
          }}
        >
          Limpiar
        </Button>
      ) : null}
    </>
  )
}

/**
 * Chooses which pending queue to show: both, the household one or the viewer's
 * personal one.
 */
function ScopeMenu({
  filters,
  onChange,
}: {
  filters: CatalogFilters
  onChange: (patch: Partial<CatalogFilters>) => void
}) {
  const current =
    scopeOptions.find((option) => option.value === filters.scope)?.label ??
    'Ambas listas'
  const narrowed = scopeFilterApplies(filters)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={narrowed ? 'default' : 'outline'}
          className="gap-1"
        >
          {narrowed ? current : 'Lista'}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={filters.scope}
          onValueChange={(value) => onChange({ scope: value as ScopeFilter })}
        >
          {scopeOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StatusMenu({
  filters,
  onChange,
}: {
  filters: CatalogFilters
  onChange: (patch: Partial<CatalogFilters>) => void
}) {
  const current =
    statusOptions.find((option) => option.value === filters.status)?.label ??
    'Todos'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={filters.status === 'all' ? 'outline' : 'default'}
          className="gap-1"
        >
          {filters.status === 'all' ? 'Estado' : `Estado: ${current}`}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={filters.status}
          onValueChange={(value) => onChange({ status: value as StatusFilter })}
        >
          {statusOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FavoriteToggle({
  filters,
  onChange,
}: {
  filters: CatalogFilters
  onChange: (patch: Partial<CatalogFilters>) => void
}) {
  const active = filters.favorites === 'favorites'
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      aria-pressed={active}
      onClick={() => onChange({ favorites: active ? 'all' : 'favorites' })}
    >
      <HeartIcon className={cn('size-3.5', active && 'fill-current')} />
      Favoritos
    </Button>
  )
}
