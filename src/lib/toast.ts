export interface ToastOptions {
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
  /** Milliseconds before the toast disappears. 0 keeps it until dismissed. */
  duration?: number
}

export interface ToastItem extends ToastOptions {
  id: number
  variant: 'default' | 'destructive'
}

let sequence = 0
let toasts: ToastItem[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getToasts(): ToastItem[] {
  return toasts
}

export function dismissToast(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id)
  emit()
}

/**
 * Programmatic toast helper. Lightweight (no new dependency): backed by
 * radix-ui's Toast primitives and a tiny external store so any component can
 * call `toast({ title, description, variant })`.
 */
export function toast(options: ToastOptions) {
  const id = ++sequence
  toasts = [...toasts, { id, variant: 'default', ...options }]
  emit()
  const duration = options.duration ?? 3500
  if (duration > 0) {
    window.setTimeout(() => dismissToast(id), duration)
  }
}
