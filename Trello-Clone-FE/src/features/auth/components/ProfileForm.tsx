import { zodResolver } from '@hookform/resolvers/zod';
import { AvatarUrlSchema, UserNameSchema, type UserDto } from '@trello-clone/shared';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useUpdateProfile } from '../queries';

// The shared field rules; an empty avatar field means "no avatar" (null), as the API expects.
const ProfileFormSchema = z.object({
  name: UserNameSchema,
  avatarUrl: z.union([z.literal(''), AvatarUrlSchema]),
});
type ProfileFormInput = z.input<typeof ProfileFormSchema>;
type ProfileFormData = z.output<typeof ProfileFormSchema>;

const FIELDS = ['name', 'avatarUrl'] as const;
type Field = (typeof FIELDS)[number];
const isField = (path: unknown): path is Field => FIELDS.includes(path as Field);

const GENERIC_ERROR = "Couldn't save your profile. Check your connection and try again.";
export const PROFILE_SAVED_MESSAGE = 'Profile updated';

export function ProfileForm({ user }: { user: UserDto }) {
  const updateProfile = useUpdateProfile();
  const form = useForm<ProfileFormInput, unknown, ProfileFormData>({
    resolver: zodResolver(ProfileFormSchema),
    defaultValues: { name: user.name, avatarUrl: user.avatarUrl ?? '' },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name, avatarUrl }) => {
    try {
      const saved = await updateProfile.mutateAsync({ name, avatarUrl: avatarUrl || null });
      form.reset({ name: saved.name, avatarUrl: saved.avatarUrl ?? '' });
      toast.success(PROFILE_SAVED_MESSAGE);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        const fieldErrors = error.details.filter((detail) => isField(detail.path));
        for (const { path, message } of fieldErrors) form.setError(path as Field, { message });
        if (fieldErrors.length) return;
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
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" type="email" value={user.email} readOnly disabled />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          autoComplete="name"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'profile-name-error' : undefined}
          {...form.register('name')}
        />
        {errors.name && (
          <p id="profile-name-error" className="text-xs text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-avatar">Avatar URL</Label>
        <Input
          id="profile-avatar"
          type="url"
          inputMode="url"
          placeholder="https://"
          aria-invalid={Boolean(errors.avatarUrl)}
          aria-describedby={errors.avatarUrl ? 'profile-avatar-error' : 'profile-avatar-hint'}
          {...form.register('avatarUrl')}
        />
        {errors.avatarUrl ? (
          <p id="profile-avatar-error" className="text-xs text-destructive">
            {errors.avatarUrl.message}
          </p>
        ) : (
          <p id="profile-avatar-hint" className="text-xs text-muted-foreground">
            An https:// image link. Leave empty to show your initials.
          </p>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting || !isDirty} className="self-start">
        {isSubmitting ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
