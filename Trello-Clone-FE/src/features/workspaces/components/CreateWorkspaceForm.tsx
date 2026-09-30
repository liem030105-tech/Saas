import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateWorkspaceInputSchema,
  type CreateWorkspaceData,
  type CreateWorkspaceInput,
  type WorkspaceDto,
} from '@trello-clone/shared';
import { useForm } from 'react-hook-form';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useCreateWorkspace } from '../queries';

const GENERIC_ERROR = "Couldn't create the workspace. Check your connection and try again.";

interface CreateWorkspaceFormProps {
  /** Called with the new workspace (the caller navigates to it). */
  onCreated: (workspace: WorkspaceDto) => void;
  submitLabel?: string;
  autoFocus?: boolean;
}

/** The workspace name form, used by the first-workspace screen and the create dialog. */
export function CreateWorkspaceForm({
  onCreated,
  submitLabel = 'Create workspace',
  autoFocus = false,
}: CreateWorkspaceFormProps) {
  const createWorkspace = useCreateWorkspace();
  const form = useForm<CreateWorkspaceInput, unknown, CreateWorkspaceData>({
    resolver: zodResolver(CreateWorkspaceInputSchema),
    defaultValues: { name: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      onCreated(await createWorkspace.mutateAsync(values));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        const nameError = error.details.find((detail) => detail.path === 'name');
        if (nameError) {
          form.setError('name', { message: nameError.message });
          return;
        }
      }
      const message =
        error instanceof ApiError && error.code !== NETWORK_ERROR_CODE
          ? error.message
          : GENERIC_ERROR;
      form.setError('root', { message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          placeholder="e.g. Acme Team"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'workspace-name-error' : undefined}
          {...form.register('name')}
        />
        {errors.name && (
          <p id="workspace-name-error" className="text-xs text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Creating…' : submitLabel}
      </Button>
    </form>
  );
}
