import { zodResolver } from '@hookform/resolvers/zod';
import {
  WorkspaceNameSchema,
  WorkspaceSlugSchema,
  type UpdateWorkspaceInput,
  type WorkspaceDto,
} from '@trello-clone/shared';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useUpdateWorkspace } from '../queries';

export const WORKSPACE_SAVED_MESSAGE = 'Workspace settings saved.';
export const SLUG_TAKEN_MESSAGE = 'This URL is already taken. Try another one.';
const GENERIC_ERROR = "Couldn't save the settings. Check your connection and try again.";

// Both fields are always in the form; only the changed ones are sent (UpdateWorkspaceInputSchema).
const DetailsFormSchema = z.object({ name: WorkspaceNameSchema, slug: WorkspaceSlugSchema });
type DetailsFormInput = z.input<typeof DetailsFormSchema>;
type DetailsFormData = z.output<typeof DetailsFormSchema>;

/**
 * Rename a workspace or change its slug (≥ ADMIN). After a slug change the page follows the
 * workspace to its new URL (useWorkspaceBySlug).
 */
export function WorkspaceDetailsForm({ workspace }: { workspace: WorkspaceDto }) {
  const updateWorkspace = useUpdateWorkspace(workspace.id);
  const form = useForm<DetailsFormInput, unknown, DetailsFormData>({
    resolver: zodResolver(DetailsFormSchema),
    values: { name: workspace.name, slug: workspace.slug },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const changes: UpdateWorkspaceInput = {};
    if (values.name !== workspace.name) changes.name = values.name;
    if (values.slug !== workspace.slug) changes.slug = values.slug;
    if (changes.name === undefined && changes.slug === undefined) return;

    try {
      await updateWorkspace.mutateAsync(changes);
      toast.success(WORKSPACE_SAVED_MESSAGE);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        form.setError('slug', { message: SLUG_TAKEN_MESSAGE });
        return;
      }
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        const fieldErrors = error.details.filter(
          (detail) => detail.path === 'name' || detail.path === 'slug',
        );
        for (const detail of fieldErrors) {
          form.setError(detail.path as 'name' | 'slug', { message: detail.message });
        }
        if (fieldErrors.length > 0) return;
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
        <Label htmlFor="workspace-settings-name">Name</Label>
        <Input
          id="workspace-settings-name"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'workspace-settings-name-error' : undefined}
          {...form.register('name')}
        />
        {errors.name && (
          <p id="workspace-settings-name-error" className="text-xs text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-settings-slug">URL</Label>
        <div className="flex items-center gap-1">
          <span aria-hidden="true" className="text-sm text-muted-foreground">
            /w/
          </span>
          <Input
            id="workspace-settings-slug"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.slug)}
            aria-describedby={
              errors.slug ? 'workspace-settings-slug-error' : 'workspace-settings-slug-hint'
            }
            {...form.register('slug')}
          />
        </div>
        {errors.slug ? (
          <p id="workspace-settings-slug-error" className="text-xs text-destructive">
            {errors.slug.message}
          </p>
        ) : (
          <p id="workspace-settings-slug-hint" className="text-xs text-muted-foreground">
            Changing the URL breaks links to the old one.
          </p>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
