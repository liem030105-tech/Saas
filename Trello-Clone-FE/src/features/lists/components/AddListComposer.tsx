import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateListInputSchema,
  type CreateListData,
  type CreateListInput,
} from '@trello-clone/shared';
import { PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { useCreateList } from '../queries';

interface AddListComposerProps {
  boardId: string;
  /** How many lists the board shows: "Add a list" when none, "Add another list" otherwise. */
  listCount: number;
}

/**
 * "Add another list" (docs/design/ui.md → Board): an inline composer, never a dialog. Enter adds
 * the list and keeps the composer open for the next one; Escape or ✕ closes it.
 */
export function AddListComposer({ boardId, listCount }: AddListComposerProps) {
  const [open, setOpen] = useState(false);
  const label = listCount > 0 ? 'Add another list' : 'Add a list';

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="w-[272px] shrink-0 justify-start bg-white/25 text-inherit hover:bg-white/40"
        onClick={() => setOpen(true)}
      >
        <PlusIcon aria-hidden="true" />
        {label}
      </Button>
    );
  }
  return <ListForm boardId={boardId} listCount={listCount} onClose={() => setOpen(false)} />;
}

function ListForm({
  boardId,
  listCount,
  onClose,
}: {
  boardId: string;
  listCount: number;
  onClose: () => void;
}) {
  const createList = useCreateList(boardId);
  const formRef = useRef<HTMLFormElement>(null);
  // Each new list pushes the composer right; keep it in view for the next title.
  useEffect(() => {
    formRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [listCount]);
  const form = useForm<CreateListInput, unknown, CreateListData>({
    resolver: zodResolver(CreateListInputSchema),
    defaultValues: { title: '' },
  });
  const titleError = form.formState.errors.title?.message;

  const onSubmit = form.handleSubmit((values) => {
    // Optimistic: the list shows at once and the field clears for the next one.
    createList.mutate(values.title);
    form.reset({ title: '' });
    form.setFocus('title');
  });

  return (
    <form
      ref={formRef}
      noValidate
      aria-label="Add list"
      className="flex w-[272px] shrink-0 flex-col gap-2 rounded-lg bg-muted p-2 text-foreground"
      onSubmit={(event) => void onSubmit(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <Input
        aria-label="List title"
        placeholder="Enter list title…"
        autoFocus
        aria-invalid={titleError ? true : undefined}
        aria-describedby={titleError ? 'list-title-error' : undefined}
        className="bg-background"
        {...form.register('title')}
      />
      {titleError && (
        <p id="list-title-error" role="alert" className="text-sm text-destructive">
          {titleError}
        </p>
      )}
      <div className="flex items-center gap-1">
        <Button type="submit" size="sm">
          Add list
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
