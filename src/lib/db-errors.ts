/**
 * Recognizes the PostgREST/Postgres errors that mean the database is behind
 * the migrations shipped with the app (a missing table or column), as opposed
 * to a real permission/network failure.
 *
 * Production can be deployed before its Supabase project runs `supabase db
 * push`; in that window the client degrades gracefully instead of failing the
 * whole catalog (which used to leave «Inicio» and «Catálogo» empty).
 */
interface ErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function asErrorLike(error: unknown): ErrorLike | null {
  return typeof error === 'object' && error != null
    ? (error as ErrorLike)
    : null
}

export function isMissingTableError(error: unknown, table?: string): boolean {
  const value = asErrorLike(error)
  if (!value) return false
  if (value.code === '42P01' || value.code === 'PGRST205') return true
  const message = value.message ?? ''
  if (!/could not find the table|relation .* does not exist/i.test(message)) {
    return false
  }
  return table ? message.includes(table) : true
}

export function isMissingColumnError(error: unknown, column?: string): boolean {
  const value = asErrorLike(error)
  if (!value) return false
  if (value.code === '42703' || value.code === 'PGRST204') return true
  const message = value.message ?? ''
  if (
    !/column .* does not exist|could not find the '.*' column/i.test(message)
  ) {
    return false
  }
  return column ? message.includes(column) : true
}
