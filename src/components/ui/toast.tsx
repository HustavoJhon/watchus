import * as React from 'react'
import { Toast as ToastPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'
import { dismissToast, getToasts, subscribeToasts } from '@/lib/toast'

export function Toaster() {
  const items = React.useSyncExternalStore(subscribeToasts, getToasts)

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={3500}>
      {items.map(({ id, title, description, variant }) => (
        <ToastPrimitive.Root
          key={id}
          onOpenChange={(open) => {
            if (!open) dismissToast(id)
          }}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border bg-popover px-3 py-2.5 text-popover-foreground shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right',
            'data-[swipe=move]:transition-none data-[swipe=end]:animate-out data-[swipe=end]:fade-out-0 data-[swipe=end]:slide-out-to-right',
            variant === 'destructive' &&
              'border-destructive/40 text-destructive',
          )}
        >
          <div className="flex flex-col gap-0.5">
            {title ? (
              <ToastPrimitive.Title className="text-sm font-semibold">
                {title}
              </ToastPrimitive.Title>
            ) : null}
            {description ? (
              <ToastPrimitive.Description className="text-sm text-muted-foreground">
                {description}
              </ToastPrimitive.Description>
            ) : null}
          </div>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed right-0 bottom-16 z-[60] flex w-full max-w-sm flex-col-reverse gap-2 p-4 sm:right-4 sm:bottom-4" />
    </ToastPrimitive.Provider>
  )
}
