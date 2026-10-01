import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateCardInputSchema,
  type CreateCardData,
  type CreateCardInput,
} from '@trello-clone/shared';
import { PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useCreateCard } from '../queries';

interface AddCardComposerProps {
  boardId: string;
  listId: string;
  listTitle: string;
}

/**
 * "Add a card" at the bottom of a list (docs/design/ui.md → Board): an inline composer, never a
 * dialog. Enter adds the card and keeps the composer open for the next one; Escape or ✕ closes it.
 */
export function AddCardComposer({ boardId, listId, listTitle }: AddCardComposerProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Add a card to ${listTitle}`}
        className="justify-start text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <PlusIcon aria-hidden="true" />
        Add a card
      </Button>
    );
  }
  return <CardForm boardId={boardId} listId={listId} onClose={() => setOpen(false)} />;
}

function CardForm({
  boardId,
  listId,
  onClose,
}: {
  boardId: string;
  listId: string;
  onClose: () => void;
}) {
  const createCard = useCreateCard(boardId, listId);
  const form = useForm<CreateCardInput, unknown, CreateCardData>({
    resolver: zodResolver(CreateCardInputSchema),
    defaultValues: { title: '' },
  });
  const titleError = form.formState.errors.title?.message;
  const errorId = `card-title-error-${listId}`;

  const onSubmit = form.handleSubmit((values) => {
    // Optimistic: the card shows at once and the field clears for the next one.
    createCard.mutate(values.title);
    form.reset({ title: '' });
    form.setFocus('title');
  });

  return (
    <form
      noValidate
      aria-label="Add card"
      className="flex flex-col gap-2"
      onSubmit={(event) => void onSubmit(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <textarea
        aria-label="Card title"
        placeholder="Enter a title for this card…"
        autoFocus
        rows={2}
        aria-invalid={titleError ? true : undefined}
        aria-describedby={titleError ? errorId : undefined}
        className={cn(
          'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aria-invalid:border-destructive',
        )}
        {...form.register('title')}
        onKeyDown={(event) => {
          // Enter adds the card (titles are one line); Shift+Enter is ignored too.
          if (event.key === 'Enter') {
            event.preventDefault();
            void onSubmit();
          }
        }}
      />
      {titleError && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {titleError}
        </p>
      )}
      <div className="flex items-center gap-1">
        <Button type="submit" size="sm">
          Add card
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
