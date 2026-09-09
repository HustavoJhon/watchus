import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useCatalogMutations } from '@/lib/queries'
import { useAuth } from '@/lib/auth'
import type { CatalogItem } from '@/lib/catalog'

const partnerHoldsTitle = (item: CatalogItem): boolean =>
  item.partnerStatus !== null ||
  item.partnerRating !== null ||
  item.partnerWatchedAt !== null

/**
 * Confirmation dialog that removes the viewer's own relation with a title.
 * The shared title row is deleted only when it becomes orphaned; when the
 * partner still holds it, the copy explains the title stays for them.
 */
export function RemoveTitleDialog({
  item,
  trigger,
  onRemoved,
}: {
  item: CatalogItem
  /** Custom trigger element. When omitted, a ghost trash button is used. */
  trigger?: ReactNode
  onRemoved?: () => void
}) {
  const auth = useAuth()
  const mutations = useCatalogMutations(auth.user)
  const [open, setOpen] = useState(false)
  const partnerHolds = useMemo(() => partnerHoldsTitle(item), [item])
  const busy = mutations.remove.isPending

  function confirm() {
    mutations.remove.mutate(item.title.id, {
      onSuccess: () => {
        setOpen(false)
        onRemoved?.()
      },
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Quitar ${item.title.title} del catálogo`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon className="size-4" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿Quitar «{item.title.title}» del catálogo?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {partnerHolds
              ? 'Tu pareja aún lo conserva en el catálogo compartido. Solo desaparecerá de tu perfil.'
              : 'Se eliminará de tu catálogo compartido.'}{' '}
            Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={busy}>
              Cancelar
            </Button>
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => confirm()}
          >
            <Trash2Icon className="size-4" />
            {busy ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
