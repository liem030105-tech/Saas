import { useState, type ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  /** Opens the dialog; omit it and pass `open`/`onOpenChange` to open it from elsewhere (a menu). */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  /** Resolves when done (the dialog closes) or returns an error message to show in it. */
  onConfirm: () => Promise<string | null>;
}

/** A destructive action behind an AlertDialog (docs/design/ui.md → Confirm destructive action). */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onConfirm,
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
}: ConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onControlledOpenChange?.(next);
  };
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onOpenChange = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    setError(null);
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    const message = await onConfirm();
    setPending(false);
    if (message) setError(message);
    else setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={() => void confirm()}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
