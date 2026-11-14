/**
 * Turns a reorder rejection into a message worth showing the user.
 *
 * Both reorder RPCs validate the submitted list against the server's own
 * pending set, so a rejection means the client's view was stale: the partner
 * reordered at the same time, or a title stopped being pending. The optimistic
 * update is always rolled back; this explains why, instead of silently
 * reverting the drag and leaving the user thinking it worked.
 */
export function describeReorderError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''

  // Ordered from most to least specific: the stale-list message is the most
  // common rejection, and the catch-all checks below would otherwise swallow it.
  if (/whole pending/i.test(raw)) {
    return 'La lista cambió mientras la ordenabas. Se ha actualizado.'
  }
  if (/not pending/i.test(raw)) {
    return 'Uno de los títulos ya no está pendiente. Se ha actualizado.'
  }
  if (/duplicate/i.test(raw)) {
    return 'La lista tenía títulos repetidos. Se ha actualizado.'
  }
  if (/household/i.test(raw)) {
    return 'Necesitas pertenecer a un hogar para ordenar la lista del hogar.'
  }
  if (/not authenticated/i.test(raw)) {
    return 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
  }
  return 'No se ha podido guardar el nuevo orden. Se ha actualizado.'
}
