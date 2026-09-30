import { zodResolver } from '@hookform/resolvers/zod';
import { RegisterInputSchema, type RegisterData, type RegisterInput } from '@trello-clone/shared';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useRegister } from '../queries';
import { safeRedirectPath } from '../redirect';

const FIELDS = ['email', 'password', 'name'] as const;
type Field = (typeof FIELDS)[number];
const isField = (path: unknown): path is Field => FIELDS.includes(path as Field);

const GENERIC_ERROR = "Couldn't create your account. Check your connection and try again.";

export function RegisterForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const registerUser = useRegister();
  const form = useForm<RegisterInput, unknown, RegisterData>({
    resolver: zodResolver(RegisterInputSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await registerUser.mutateAsync(values);
      // Same rule as login: back to where the visitor came from (e.g. an invite link), if safe.
      await navigate(safeRedirectPath(searchParams.get('redirectTo')));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        // Same schema on both sides, so this is rare; map the server's field errors back anyway.
        const fieldErrors = error.details.filter((detail) => isField(detail.path));
        for (const { path, message } of fieldErrors) form.setError(path as Field, { message });
        if (fieldErrors.length) return;
      }
      // Canonical API errors (409, …) carry a message written for users. Failures without one
      // (network down, a proxy's HTML error page) get the generic copy: no technical text in the UI.
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
        <Label htmlFor="register-name">Name</Label>
        <Input
          id="register-name"
          autoComplete="name"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'register-name-error' : undefined}
          {...form.register('name')}
        />
        {errors.name && (
          <p id="register-name-error" className="text-xs text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'register-email-error' : undefined}
          {...form.register('email')}
        />
        {errors.email && (
          <p id="register-email-error" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="register-password">Password</Label>
        <Input
          id="register-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'register-password-error' : 'register-password-hint'}
          {...form.register('password')}
        />
        {errors.password ? (
          <p id="register-password-error" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        ) : (
          <p id="register-password-hint" className="text-xs text-muted-foreground">
            8 to 72 characters.
          </p>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
