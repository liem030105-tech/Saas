import { zodResolver } from '@hookform/resolvers/zod';
import { ChecklistItemContentSchema, ChecklistTitleSchema } from '@trello-clone/shared';
import { ListChecksIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EditableTitle } from '@/components/forms/EditableTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { isOptimisticItem } from '../hooks/useChecklists';
import { errorMessage } from '../queries';

import type { useChecklists } from '../hooks/useChecklists';
import type { ChecklistDto } from '@trello-clone/shared';

const ADD_ERROR = "Couldn't add the checklist. Check your connection and try again.";
const DELETE_ERROR = "Couldn't delete the checklist. Check your connection and try again.";

type Checklists = ReturnType<typeof useChecklists>;

interface ChecklistSectionProps {
  checklist: ChecklistDto;
  checklists: Checklists;
  /** Tick, add, rename and delete (≥ MEMBER, board not archived; UX only, the API re-checks). */
  canEdit: boolean;
}

/**
 * One checklist in the card modal (docs/design/ui.md → Card modal): its title (renames in place),
 * a progress bar, its items as checkboxes, and "Add an item". A VIEWER sees it read-only.
 */
export function ChecklistSection({ checklist, checklists, canEdit }: ChecklistSectionProps) {
  const done = checklist.items.filter((item) => item.done).length;
  const total = checklist.items.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const headingId = `checklist-${checklist.id}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ListChecksIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <div id={headingId} className="min-w-0 flex-1">
          {canEdit ? (
            <EditableTitle
              title={checklist.title}
              schema={ChecklistTitleSchema}
              as="h3"
              hint="Rename checklist"
              inputLabel="Checklist title"
              headingClassName="text-sm font-semibold"
              inputClassName="h-8 text-sm font-semibold"
              onRename={(title) =>
                checklists.renameChecklist.mutate({
                  checklistId: checklist.id,
                  title,
                  from: checklist.title,
                })
              }
            />
          ) : (
            <h3 className="px-2 text-sm font-semibold break-words">{checklist.title}</h3>
          )}
        </div>
        {canEdit && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm">
                Delete
              </Button>
            }
            title={`Delete ${checklist.title}?`}
            description="The checklist and its items are deleted for everyone."
            confirmLabel="Delete checklist"
            pendingLabel="Deleting…"
            onConfirm={async () => {
              try {
                await checklists.removeChecklist.mutateAsync(checklist.id);
                return null;
              } catch (error) {
                return errorMessage(error, DELETE_ERROR);
              }
            }}
          />
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-9 text-right">{percent}%</span>
        <div
          role="progressbar"
          aria-label={`${checklist.title} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={percent === 100 ? 'h-full bg-green-600' : 'h-full bg-primary'}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      {total > 0 && (
        <ul className="flex flex-col gap-1">
          {checklist.items.map((item) => (
            <ChecklistItemRow
              key={item.id}
              checklistId={checklist.id}
              item={item}
              checklists={checklists}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
      {canEdit && <AddItemComposer checklistId={checklist.id} checklists={checklists} />}
    </section>
  );
}

/**
 * An item: its checkbox keeps its own state, so it changes the moment it is clicked (the
 * optimistic cache update only lands after in-flight queries are cancelled); the state follows
 * the stored value whenever that changes.
 */
function ChecklistItemRow({
  checklistId,
  item,
  checklists,
  canEdit,
}: {
  checklistId: string;
  item: ChecklistDto['items'][number];
  checklists: Checklists;
  canEdit: boolean;
}) {
  const [checked, setChecked] = useState({ stored: item.done, value: item.done });
  if (checked.stored !== item.done) setChecked({ stored: item.done, value: item.done });
  const pending = isOptimisticItem(item);

  return (
    <li className="group flex items-start gap-2 rounded px-1 py-0.5 hover:bg-muted/60">
      <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0"
          disabled={!canEdit || pending}
          checked={checked.value}
          onChange={(event) => {
            const done = event.target.checked;
            setChecked({ ...checked, value: done });
            checklists.toggleItem.mutate({ checklistId, itemId: item.id, done });
          }}
        />
        <span
          className={
            checked.value ? 'break-words text-muted-foreground line-through' : 'break-words'
          }
        >
          {item.content}
        </span>
      </label>
      {canEdit && !pending && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          aria-label={`Delete item ${item.content}`}
          onClick={() => checklists.removeItem.mutate({ checklistId, item })}
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

const ItemFormSchema = z.object({ content: ChecklistItemContentSchema });
type ItemFormInput = z.input<typeof ItemFormSchema>;
type ItemFormData = z.output<typeof ItemFormSchema>;

/** "Add an item": Enter adds it and keeps the field open for the next one; Escape closes it. */
function AddItemComposer({
  checklistId,
  checklists,
}: {
  checklistId: string;
  checklists: Checklists;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<ItemFormInput, unknown, ItemFormData>({
    resolver: zodResolver(ItemFormSchema),
    defaultValues: { content: '' },
  });
  const error = form.formState.errors.content?.message;
  const errorId = `checklist-item-error-${checklistId}`;

  if (!open) {
    return (
      <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>
        Add an item
      </Button>
    );
  }
  return (
    <form
      noValidate
      aria-label="Add an item"
      className="flex flex-col gap-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation(); // closes the composer, not the card modal
          setOpen(false);
        }
      }}
      onSubmit={(event) =>
        void form.handleSubmit((values) => {
          checklists.addItem(checklistId, values.content);
          form.reset({ content: '' });
          form.setFocus('content');
        })(event)
      }
    >
      <Input
        autoFocus
        aria-label="Item"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...form.register('content')}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          <PlusIcon aria-hidden="true" />
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const ChecklistFormSchema = z.object({ title: ChecklistTitleSchema });
type ChecklistFormInput = z.input<typeof ChecklistFormSchema>;
type ChecklistFormData = z.output<typeof ChecklistFormSchema>;

/** "Checklist" under "Add to card": a popover with the title ("Checklist" to start) and "Add". */
export function AddChecklistButton({ checklists }: { checklists: Checklists }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ChecklistFormInput, unknown, ChecklistFormData>({
    resolver: zodResolver(ChecklistFormSchema),
    defaultValues: { title: 'Checklist' },
  });
  const titleError = form.formState.errors.title?.message;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          form.reset({ title: 'Checklist' });
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="justify-start">
          <ListChecksIcon aria-hidden="true" />
          Checklist
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-labelledby="add-checklist-title"
        className="flex flex-col gap-3"
      >
        <h4 id="add-checklist-title" className="text-center text-sm font-semibold">
          Add checklist
        </h4>
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) =>
            void form.handleSubmit(async (values) => {
              setError(null);
              try {
                await checklists.addChecklist.mutateAsync(values.title);
                setOpen(false);
              } catch (failure) {
                setError(errorMessage(failure, ADD_ERROR));
              }
            })(event)
          }
        >
          <label htmlFor="checklist-title" className="text-xs font-semibold">
            Title
          </label>
          <Input
            id="checklist-title"
            autoFocus
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? 'checklist-title-error' : undefined}
            {...form.register('title')}
          />
          {(titleError ?? error) && (
            <p id="checklist-title-error" role="alert" className="text-sm text-destructive">
              {titleError ?? error}
            </p>
          )}
          <Button type="submit" size="sm" disabled={checklists.addChecklist.isPending}>
            Add
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
