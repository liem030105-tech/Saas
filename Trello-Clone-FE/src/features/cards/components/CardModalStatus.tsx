import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface CardModalStatusProps {
  /** Loading the card, or loading it failed (other than "not found", which is a 404 page). */
  status: 'loading' | 'error';
  onRetry: () => void;
  onClose: () => void;
}

/** The card modal while its card loads, or when loading it failed (docs/design/ui.md → Card modal). */
export function CardModalStatus({ status, onRetry, onClose }: CardModalStatusProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-busy={status === 'loading' || undefined} className="sm:max-w-2xl">
        {status === 'loading' ? (
          <>
            <DialogTitle className="sr-only">Loading card</DialogTitle>
            <DialogDescription className="sr-only">The card is loading.</DialogDescription>
            <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded bg-muted" />
          </>
        ) : (
          <>
            <DialogTitle>Couldn&apos;t load this card.</DialogTitle>
            <DialogDescription>Check your connection and try again.</DialogDescription>
            <div className="flex gap-2">
              <Button size="sm" onClick={onRetry}>
                Try again
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
