import {
  CardDescriptionSchema,
  CardTitleSchema,
  type CardDetailDto,
  type UpdateCardInput,
} from '@trello-clone/shared';
import { ArchiveIcon, ArchiveRestoreIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EditableTitle } from '@/components/forms/EditableTitle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Markdown } from '@/components/ui/Markdown';

import { dueDateFromInput, dueDateInputValue } from '../dates';
import { useDeleteCard, useUpdateCard } from '../queries';

const DELETE_ERROR = "Couldn't delete the card. Check your connection and try again.";

interface CardDetailModalProps {
  card: CardDetailDto;
  /** The title of the card's list, for "in list …". */
  listTitle: string | undefined;
  /** Edit, archive, delete (≥ MEMBER, board not archived; UX only, the API re-checks). */
  canEdit: boolean;
  onClose: () => void;
}

/**
 * The card modal over the board (docs/design/ui.md → Card modal), at `/b/:boardId/c/:cardId`:
 * title, description (markdown), due date, completed, archive, delete. A VIEWER sees the same card
 * read-only. Members, labels, checklists and activity arrive with CARD-005.
 */
export function CardDetailModal({ card, listTitle, canEdit, onClose }: CardDetailModalProps) {
  const updateCard = useUpdateCard(card.boardId, card.id);
  const deleteCard = useDeleteCard(card.boardId, card.id);
  const save = (input: UpdateCardInput) => updateCard.mutate(input);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <div className="flex flex-col gap-1 pr-6">
          <DialogTitle asChild>
            <div>
              {canEdit ? (
                <EditableTitle
                  title={card.title}
                  schema={CardTitleSchema}
                  as="h2"
                  hint="Rename card"
                  inputLabel="Card title"
                  headingClassName="text-lg font-semibold"
                  inputClassName="h-9 text-lg font-semibold"
                  onRename={(title) => save({ title })}
                />
              ) : (
                <h2 className="px-2 text-lg font-semibold break-words">{card.title}</h2>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="px-2">
            {listTitle ? `in list ${listTitle}` : 'Card details'}
          </DialogDescription>
        </div>

        {card.archived && (
          <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
            This card is archived.{canEdit ? ' Unarchive it to show it on the board again.' : ''}
          </p>
        )}

        <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* Remounted when the stored values change, so a refetch resets the local state. */}
            <DueAndCompleted
              key={`${card.dueDate}|${card.completed}`}
              card={card}
              canEdit={canEdit}
              onSave={save}
            />
            <Description card={card} canEdit={canEdit} onSave={save} />
          </div>

          {canEdit && (
            <section aria-labelledby="card-actions" className="flex flex-col gap-2 sm:w-40">
              <h3
                id="card-actions"
                className="text-xs font-semibold text-muted-foreground uppercase"
              >
                Actions
              </h3>
              <Button
                variant="secondary"
                size="sm"
                className="justify-start"
                onClick={() => save({ archived: !card.archived })}
              >
                {card.archived ? (
                  <>
                    <ArchiveRestoreIcon aria-hidden="true" />
                    Unarchive
                  </>
                ) : (
                  <>
                    <ArchiveIcon aria-hidden="true" />
                    Archive
                  </>
                )}
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="secondary" size="sm" className="justify-start">
                    <Trash2Icon aria-hidden="true" />
                    Delete
                  </Button>
                }
                title={`Delete ${card.title}?`}
                description="The card is deleted for everyone. This can't be undone."
                confirmLabel="Delete card"
                pendingLabel="Deleting…"
                onConfirm={async () => {
                  try {
                    await deleteCard.mutateAsync();
                  } catch (error) {
                    return error instanceof ApiError && error.code !== NETWORK_ERROR_CODE
                      ? error.message
                      : DELETE_ERROR;
                  }
                  toast.success(`${card.title} was deleted.`);
                  onClose();
                  return null;
                }}
              />
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SectionProps {
  card: CardDetailDto;
  canEdit: boolean;
  onSave: (input: UpdateCardInput) => void;
}

/**
 * Due date (a whole day, see ../dates.ts) and the completed checkbox. Both keep their own value,
 * so they change the moment they are used: the optimistic cache update only lands after in-flight
 * queries are cancelled, and a controlled input would snap back for that moment.
 */
function DueAndCompleted({ card, canEdit, onSave }: SectionProps) {
  const [dueDate, setDueDate] = useState(dueDateInputValue(card.dueDate));
  const [completed, setCompleted] = useState(card.completed);

  return (
    <section aria-labelledby="card-due" className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <h3 id="card-due" className="text-xs font-semibold text-muted-foreground uppercase">
          Due date
        </h3>
        <input
          type="date"
          aria-label="Due date"
          disabled={!canEdit}
          value={dueDate}
          onChange={(event) => {
            setDueDate(event.target.value);
            onSave({ dueDate: dueDateFromInput(event.target.value) });
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-70"
        />
      </div>
      <label className="flex h-9 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          disabled={!canEdit}
          checked={completed}
          onChange={(event) => {
            setCompleted(event.target.checked);
            onSave({ completed: event.target.checked });
          }}
        />
        Complete
      </label>
    </section>
  );
}

/** The description as rendered markdown; "Edit" swaps in a textarea with Save and Cancel. */
function Description({ card, canEdit, onSave }: SectionProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveDraft = () => {
    if (draft === null) return;
    const parsed = CardDescriptionSchema.safeParse(draft.trim() === '' ? null : draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid description');
      return;
    }
    if (parsed.data !== card.description) onSave({ description: parsed.data });
    setDraft(null);
    setError(null);
  };

  return (
    <section aria-labelledby="card-description" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="card-description" className="text-xs font-semibold text-muted-foreground uppercase">
          Description
        </h3>
        {canEdit && draft === null && card.description && (
          <Button variant="ghost" size="sm" onClick={() => setDraft(card.description ?? '')}>
            Edit
          </Button>
        )}
      </div>
      {draft !== null ? (
        <div className="flex flex-col gap-2">
          <textarea
            aria-label="Description"
            autoFocus
            rows={8}
            value={draft}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'card-description-error' : 'card-description-hint'}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
          {error ? (
            <p id="card-description-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : (
            <p id="card-description-hint" className="text-xs text-muted-foreground">
              Markdown is supported.
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={saveDraft}>
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : card.description ? (
        <Markdown>{card.description}</Markdown>
      ) : canEdit ? (
        <button
          type="button"
          className="rounded-md bg-muted px-3 py-6 text-left text-sm text-muted-foreground hover:bg-muted/70"
          onClick={() => setDraft('')}
        >
          Add a more detailed description…
        </button>
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
    </section>
  );
}
