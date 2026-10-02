import { zodResolver } from '@hookform/resolvers/zod';
import {
  CardDescriptionSchema,
  CardTitleSchema,
  type CardDetailDto,
  type LabelDto,
  type UpdateCardInput,
} from '@trello-clone/shared';
import { ArchiveIcon, ArchiveRestoreIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EditableTitle } from '@/components/forms/EditableTitle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Markdown } from '@/components/ui/Markdown';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { ActivityFeed, type ActivityNames } from '@/features/boards';
import { CommentSection, type CommentAccess } from '@/features/comments';

import { dueDateFromInput, dueDateInputValue } from '../dates';
import { AttachmentsSection } from './AttachmentsSection';
import { AddChecklistButton, ChecklistSection } from './ChecklistSection';
import { LabelChip, LabelPicker } from './LabelPicker';
import { useAttachments } from '../hooks/useAttachments';
import { useCardSocket } from '../hooks/useCardSocket';
import { useChecklists } from '../hooks/useChecklists';
import { useDeleteCard, useForgetCard, useUpdateCard } from '../queries';
import { MemberPicker, type WorkspaceMembers } from './MemberPicker';

const DELETE_ERROR = "Couldn't delete the card. Check your connection and try again.";

interface CardDetailModalProps {
  card: CardDetailDto;
  /** The title of the card's list, for "in list …". */
  listTitle: string | undefined;
  /** The board's labels, for the label picker. */
  boardLabels: LabelDto[];
  /** The workspace's members, for the member picker. */
  workspaceMembers: WorkspaceMembers;
  /** Edit, archive, delete (≥ MEMBER, board not archived; UX only, the API re-checks). */
  canEdit: boolean;
  /** Delete anyone's attachment (≥ ADMIN, board not archived); one's own needs only `canEdit`. */
  canDeleteAnyAttachment: boolean;
  /** Names of the board's lists and cards and the workspace's members, for the activity entries. */
  activityNames: ActivityNames;
  /** Who is looking and what they may do with comments. */
  commentAccess: CommentAccess;
  onClose: () => void;
}

/**
 * The card modal over the board (docs/design/ui.md → Card modal), at `/b/:boardId/c/:cardId`:
 * title, description (markdown), due date, completed, archive, delete. A VIEWER sees the same card
 * read-only. Labels since CARD-005a, members since CARD-005b, checklists since CARD-005c, comments
 * since CARD-005d, the card's activity ("Show details") since CARD-005e, and attachments with the
 * cover since ATTACHMENTS-001.
 */
export function CardDetailModal({
  card,
  listTitle,
  boardLabels,
  workspaceMembers,
  canEdit,
  canDeleteAnyAttachment,
  activityNames,
  commentAccess,
  onClose,
}: CardDetailModalProps) {
  const [showDetails, setShowDetails] = useState(false);
  useCardSocket(card.id, commentAccess.user?.id); // others' changes to this card (REALTIME-001)
  const updateCard = useUpdateCard(card.boardId, card.id);
  const deleteCard = useDeleteCard(card.boardId, card.id);
  const forgetCard = useForgetCard();
  const checklists = useChecklists(card.boardId, card.id);
  const attachments = useAttachments(card.boardId, card.id);
  const save = (input: UpdateCardInput) => updateCard.mutate(input);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl"
        // Escape in a field edited in place (a title, the "Add an item" composer) leaves the field;
        // Radix sees the key first (on the document), so the card must not close for it.
        onEscapeKeyDown={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-inline-edit]')) {
            event.preventDefault();
          }
        }}
      >
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
            {card.members.length > 0 && (
              <section aria-labelledby="card-members" className="flex flex-col gap-1">
                <h3
                  id="card-members"
                  className="text-xs font-semibold text-muted-foreground uppercase"
                >
                  Members
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {card.members.map((user) => (
                    <li key={user.id} className="flex items-center gap-1.5 text-sm">
                      <UserAvatar user={user} size="sm" />
                      {user.name}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {card.labels.length > 0 && (
              <section aria-labelledby="card-labels" className="flex flex-col gap-1">
                <h3
                  id="card-labels"
                  className="text-xs font-semibold text-muted-foreground uppercase"
                >
                  Labels
                </h3>
                <ul className="flex flex-wrap gap-1">
                  {card.labels.map((label) => (
                    <li key={label.id}>
                      <LabelChip label={label} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {/* Remounted when the stored values change, so a refetch resets the local state. */}
            <DueAndCompleted
              key={`${card.dueDate}|${card.completed}`}
              card={card}
              canEdit={canEdit}
              onSave={save}
            />
            <Description card={card} canEdit={canEdit} onSave={save} />
            <AttachmentsSection
              card={card}
              attachments={attachments}
              canEdit={canEdit}
              canDelete={(file) =>
                canDeleteAnyAttachment || (canEdit && file.uploader.id === commentAccess.user?.id)
              }
              onSetCover={(coverAttachmentId) => save({ coverAttachmentId })}
            />
            {card.checklists.map((checklist) => (
              <ChecklistSection
                key={checklist.id}
                checklist={checklist}
                checklists={checklists}
                canEdit={canEdit}
              />
            ))}
            <CommentSection
              boardId={card.boardId}
              cardId={card.id}
              access={commentAccess}
              headerAction={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={showDetails}
                  onClick={() => setShowDetails((shown) => !shown)}
                >
                  {showDetails ? 'Hide details' : 'Show details'}
                </Button>
              }
            >
              {showDetails && (
                <ActivityFeed boardId={card.boardId} cardId={card.id} names={activityNames} />
              )}
            </CommentSection>
          </div>

          {canEdit && (
            <div className="flex flex-col gap-6 sm:w-40">
              <section aria-labelledby="card-add" className="flex flex-col gap-2">
                <h3 id="card-add" className="text-xs font-semibold text-muted-foreground uppercase">
                  Add to card
                </h3>
                <MemberPicker
                  boardId={card.boardId}
                  cardId={card.id}
                  workspaceMembers={workspaceMembers}
                  cardMembers={card.members}
                />
                <AddChecklistButton checklists={checklists} />
                <LabelPicker
                  boardId={card.boardId}
                  cardId={card.id}
                  boardLabels={boardLabels}
                  cardLabels={card.labels}
                />
              </section>
              <section aria-labelledby="card-actions" className="flex flex-col gap-2">
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
                    forgetCard(card.id); // after leaving the card's URL, see useForgetCard
                    return null;
                  }}
                />
              </section>
            </div>
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

/** The description form: a blank text clears the description (`null`). */
const DescriptionFormSchema = z.object({
  description: z
    .string()
    .transform((text) => (text.trim() === '' ? null : text))
    .pipe(CardDescriptionSchema),
});
type DescriptionFormInput = z.input<typeof DescriptionFormSchema>;
type DescriptionFormData = z.output<typeof DescriptionFormSchema>;

/** The description as rendered markdown; "Edit" swaps in a form with Save and Cancel. */
function Description({ card, canEdit, onSave }: SectionProps) {
  const [editing, setEditing] = useState(false);

  return (
    <section aria-labelledby="card-description" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="card-description" className="text-xs font-semibold text-muted-foreground uppercase">
          Description
        </h3>
        {canEdit && !editing && card.description && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <DescriptionForm
          description={card.description}
          onSave={(description) => {
            if (description !== card.description) onSave({ description });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : card.description ? (
        <Markdown>{card.description}</Markdown>
      ) : canEdit ? (
        <button
          type="button"
          className="rounded-md bg-muted px-3 py-6 text-left text-sm text-muted-foreground hover:bg-muted/70"
          onClick={() => setEditing(true)}
        >
          Add a more detailed description…
        </button>
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
    </section>
  );
}

function DescriptionForm({
  description,
  onSave,
  onCancel,
}: {
  description: string | null;
  onSave: (description: string | null) => void;
  onCancel: () => void;
}) {
  const form = useForm<DescriptionFormInput, unknown, DescriptionFormData>({
    resolver: zodResolver(DescriptionFormSchema),
    defaultValues: { description: description ?? '' },
  });
  const error = form.formState.errors.description?.message;

  return (
    <form
      noValidate
      aria-label="Edit description"
      className="flex flex-col gap-2"
      onSubmit={(event) => void form.handleSubmit((values) => onSave(values.description))(event)}
    >
      <textarea
        aria-label="Description"
        autoFocus
        rows={8}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'card-description-error' : 'card-description-hint'}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        {...form.register('description')}
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
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
