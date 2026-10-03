import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateBoardInputSchema,
  type CreateBoardData,
  type CreateBoardInput,
} from '@trello-clone/shared';
import { CheckIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PLAN_LIMIT_ERROR, UpgradePrompt } from '@/features/workspaces';
import { cn } from '@/lib/utils';

import { BOARD_BACKGROUNDS, DEFAULT_BOARD_BACKGROUND, readableTextColor } from '../colors';
import { useCreateBoard } from '../queries';

const GENERIC_ERROR = "Couldn't create the board. Check your connection and try again.";

interface CreateBoardDialogProps {
  workspaceId: string;
  /** The element that opens the dialog (a tile, or the empty-state button). */
  trigger: ReactNode;
}

/** "Create board": title + a background from the presets (docs/design/ui.md → Workspace home). */
export function CreateBoardDialog({ workspaceId, trigger }: CreateBoardDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a board</DialogTitle>
          <DialogDescription>Boards hold your lists and cards.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts with an empty form. */}
        {open && <CreateBoardForm workspaceId={workspaceId} onCreated={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateBoardForm({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: () => void;
}) {
  const createBoard = useCreateBoard(workspaceId);
  const form = useForm<CreateBoardInput, unknown, CreateBoardData>({
    resolver: zodResolver(CreateBoardInputSchema),
    defaultValues: { title: '', background: DEFAULT_BOARD_BACKGROUND },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await createBoard.mutateAsync(values);
      onCreated();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PLAN_LIMIT_REACHED') {
        form.setError('root', { type: PLAN_LIMIT_ERROR, message: error.message });
        return;
      }
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        const titleError = error.details.find((detail) => detail.path === 'title');
        if (titleError) {
          form.setError('title', { message: titleError.message });
          return;
        }
      }
      form.setError('root', {
        message:
          error instanceof ApiError && error.code !== NETWORK_ERROR_CODE
            ? error.message
            : GENERIC_ERROR,
      });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="board-title">Board title</Label>
        <Input
          id="board-title"
          autoFocus
          autoComplete="off"
          placeholder="e.g. Sprint 12"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'board-title-error' : undefined}
          {...form.register('title')}
        />
        {errors.title && (
          <p id="board-title-error" className="text-xs text-destructive">
            {errors.title.message}
          </p>
        )}
      </div>

      <Controller
        control={form.control}
        name="background"
        render={({ field }) => (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Background</legend>
            <div className="flex flex-wrap gap-2">
              {BOARD_BACKGROUNDS.map(({ name, value }) => {
                const selected = field.value === value;
                return (
                  <label
                    key={value}
                    className={cn(
                      'relative flex size-10 cursor-pointer items-center justify-center rounded-md ring-offset-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      selected && 'ring-2 ring-foreground',
                    )}
                    style={{ backgroundColor: value }}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={value}
                      checked={selected}
                      onChange={() => field.onChange(value)}
                      className="sr-only"
                      aria-label={name}
                    />
                    {selected && (
                      <CheckIcon
                        aria-hidden="true"
                        className="size-5"
                        style={{ color: readableTextColor(value) }}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      />

      {errors.root &&
        (errors.root.type === PLAN_LIMIT_ERROR ? (
          <UpgradePrompt workspaceId={workspaceId} message={errors.root.message ?? ''} />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {errors.root.message}
          </p>
        ))}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Creating…' : 'Create board'}
      </Button>
    </form>
  );
}
