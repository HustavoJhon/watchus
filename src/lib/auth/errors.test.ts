import { describe, expect, it } from 'vitest'
import { errorMessage, toUserMessage } from '@/lib/auth/errors'

describe('toUserMessage', () => {
  it('maps auth errors to user-friendly messages', () => {
    expect(toUserMessage('Invalid login credentials')).toBe(
      'Correo o contraseña incorrectos.',
    )
    expect(toUserMessage('User already registered')).toBe(
      'Ya existe una cuenta con este correo electrónico.',
    )
    expect(toUserMessage('Email not confirmed')).toBe(
      'Confirma tu correo electrónico antes de iniciar sesión.',
    )
    expect(toUserMessage('Rate limit exceeded')).toBe(
      'Demasiados intentos. Espera un momento y vuelve a intentarlo.',
    )
    expect(toUserMessage('Password should be at least 6 characters.')).toBe(
      'La contraseña debe tener al menos 6 caracteres.',
    )
  })

  it('maps household rpc errors to user-friendly messages', () => {
    expect(toUserMessage('You already belong to a household.')).toBe(
      'Ya perteneces a un hogar. Deja tu hogar actual antes de unirte a otro.',
    )
    expect(
      toUserMessage('Household is full. A household can only have 2 members.'),
    ).toBe('El hogar ya tiene 2 integrantes.')
    expect(
      toUserMessage('Invalid invitation code. Please check and try again.'),
    ).toBe('Código de invitación inválido. Verifícalo y vuelve a intentar.')
    expect(toUserMessage('Household name cannot be empty.')).toBe(
      'El nombre del hogar no puede estar vacío.',
    )
  })

  it('returns null for empty input', () => {
    expect(toUserMessage(null)).toBeNull()
    expect(toUserMessage('')).toBeNull()
    expect(toUserMessage(undefined)).toBeNull()
  })

  it('falls back to the original message for unknown errors', () => {
    const message = 'Something unexpected happened'
    expect(toUserMessage(message)).toBe(message)
  })

  it('is case insensitive', () => {
    expect(toUserMessage('INVALID LOGIN CREDENTIALS')).toBe(
      'Correo o contraseña incorrectos.',
    )
  })
})

describe('errorMessage', () => {
  it('extracts the message from an error-like object', () => {
    expect(errorMessage({ message: 'Invalid login credentials' })).toBe(
      'Correo o contraseña incorrectos.',
    )
    expect(errorMessage({ message: null })).toBeNull()
    expect(errorMessage(null)).toBeNull()
    expect(errorMessage(undefined)).toBeNull()
  })
})
