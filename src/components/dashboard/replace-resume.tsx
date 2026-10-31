"use client";

import { RefreshCw, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ResumeUpload } from "@/components/dashboard/resume-upload";

/**
 * "Replace résumé" opens the uploader in a dialog. Key it by the current
 * résumé's id so it closes once the new upload has been analysed and the
 * page shows it.
 */
export function ReplaceResume() {
  return (
    <Dialog>
      <DialogPrimitive.Trigger asChild>
        <Button type="button" variant="outline" size="sm">
          <RefreshCw aria-hidden="true" />
          Replace résumé
        </Button>
      </DialogPrimitive.Trigger>
      <DialogContent className="max-w-lg p-6" aria-describedby={undefined}>
        <DialogPrimitive.Title className="sr-only">Replace résumé</DialogPrimitive.Title>
        <DialogPrimitive.Close asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" className="absolute top-3 right-3 text-muted-foreground">
            <X />
          </Button>
        </DialogPrimitive.Close>
        <ResumeUpload variant="plain" title="Upload a new résumé" />
      </DialogContent>
    </Dialog>
  );
}
