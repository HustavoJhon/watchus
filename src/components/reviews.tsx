import { useState } from 'react'
import { PencilIcon, TrashIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth'
import {
  useHouseholdContext,
  useReviewMutations,
  useTitleReviews,
} from '@/lib/queries'
import type { ReviewRow } from '@/lib/reviews'
import { formatShortDate } from '@/lib/format'

/** "Reseñas" section for the title detail page. */
export function ReviewsSection({ titleId }: { titleId: string }) {
  const auth = useAuth()
  const { members, profile } = useHouseholdContext(auth.user)
  const reviewsQuery = useTitleReviews(titleId)
  const mutations = useReviewMutations(auth.user)

  const reviews = reviewsQuery.data ?? []
  const myReview = reviews.find((review) => review.user_id === auth.user?.id)
  const partnerReview = reviews.find(
    (review) => review.user_id !== auth.user?.id,
  )

  if (reviewsQuery.isLoading) {
    return <Skeleton className="h-28 w-full rounded-lg" />
  }

  if (reviewsQuery.isError) {
    return (
      <Card className="flex flex-col items-start gap-2 bg-destructive/10 p-4">
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar las reseñas.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void reviewsQuery.refetch()}
        >
          Reintentar
        </Button>
      </Card>
    )
  }

  const displayName = (userId: string) =>
    members.find((member) => member.id === userId)?.display_name ?? '—'

  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="text-base font-semibold">Reseñas</h2>
        <p className="text-xs text-muted-foreground">
          Una reseña por persona, visible solo para tu hogar.
        </p>
      </header>

      <MyReviewEditor
        review={myReview}
        myName={profile?.display_name ?? '—'}
        busy={mutations.save.isPending || mutations.remove.isPending}
        error={
          mutations.save.isError || mutations.remove.isError
            ? 'No se pudo guardar la reseña.'
            : null
        }
        onSave={(content) => mutations.save.mutate({ titleId, content })}
        onDelete={() => mutations.remove.mutate(titleId)}
      />

      {partnerReview ? (
        <ReviewCard
          review={partnerReview}
          name={displayName(partnerReview.user_id)}
        />
      ) : null}

      {!myReview && !partnerReview ? (
        <Card className="bg-muted/40 p-4 text-center text-sm text-muted-foreground">
          Todavía no hay reseñas para este título.
        </Card>
      ) : null}
    </section>
  )
}

function ReviewCard({ review, name }: { review: ReviewRow; name: string }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <Avatar className="size-7">
          <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <p className="text-sm font-medium">{name}</p>
        <span className="text-xs text-muted-foreground">
          {formatShortDate(review.updated_at)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{review.content}</p>
    </Card>
  )
}

function MyReviewEditor({
  review,
  myName,
  busy,
  error,
  onSave,
  onDelete,
}: {
  review?: ReviewRow
  myName: string
  busy: boolean
  error: string | null
  onSave: (content: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState<boolean>(review == null)
  const [draft, setDraft] = useState(review?.content ?? '')

  if (!review) {
    // No review yet: show the editor directly.
    return (
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-sm font-medium">{myName}</p>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="¿Qué te pareció? Tu pareja podrá leerla…"
          maxLength={2000}
          disabled={busy}
        />
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={busy || draft.trim().length === 0}
          className="self-start"
          onClick={() => onSave(draft.trim())}
        >
          Publicar reseña
        </Button>
      </Card>
    )
  }

  if (editing) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-sm font-medium">{myName}</p>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          disabled={busy}
        />
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy || draft.trim().length === 0}
            onClick={() => onSave(draft.trim())}
          >
            Guardar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setDraft(review.content)
              setEditing(false)
            }}
          >
            Cancelar
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <Avatar className="size-7">
          <AvatarFallback>{myName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <p className="text-sm font-medium">{myName}</p>
        <span className="text-xs text-muted-foreground">
          {formatShortDate(review.updated_at)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{review.content}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          <PencilIcon />
          Editar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onDelete}
        >
          <TrashIcon />
          Eliminar
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  )
}
