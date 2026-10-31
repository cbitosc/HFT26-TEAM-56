"use client"

import * as React from "react"
import { cn } from "cn"
import { Dialog as DialogPrimitive } from "radix-ui"

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="motion-overlay fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "motion-dialog fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-[0_24px_64px_-16px_rgb(0_0_0/0.35)] outline-none",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base font-medium tracking-[-0.02em]", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("mt-2 text-sm leading-6 text-muted-foreground", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
}

const DialogClose = DialogPrimitive.Close

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle }
