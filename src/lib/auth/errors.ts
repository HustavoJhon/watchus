/**
 * Maps Supabase / RPC error messages to user-friendly strings.
 * Returns null when there is nothing sensible to show.
 */
export function toUserMessage(
  message: string | null | undefined,
): string | null {
  if (!message) return null
  const lower = message.toLowerCase()

  if (lower.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (lower.includes('user already registered')) {
    return 'Ya existe una cuenta con este correo electrónico.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirma tu correo electrónico antes de iniciar sesión.'
  }
  if (lower.includes('rate limit')) {
    return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'
  }
  if (lower.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.'
  }
  if (lower.includes('already belong to a household')) {
    return 'Ya perteneces a un hogar. Deja tu hogar actual antes de unirte a otro.'
  }
  if (lower.includes('household is full')) {
    return 'El hogar ya tiene 2 integrantes.'
  }
  if (lower.includes('invalid invitation code')) {
    return 'Código de invitación inválido. Verifícalo y vuelve a intentar.'
  }
  if (lower.includes('household name cannot be empty')) {
    return 'El nombre del hogar no puede estar vacío.'
  }
  if (lower.includes('no rows returned')) {
    return 'No se encontró el hogar.'
  }

  return message
}

export function errorMessage(
  error: { message?: string | null } | null | undefined,
): string | null {
  return toUserMessage(error?.message)
}
