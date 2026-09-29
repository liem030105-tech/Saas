import { zodResolver } from '@hookform/resolvers/zod';
import { LoginInputSchema, type LoginData, type LoginInput } from '@trello-clone/shared';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useLogin } from '../queries';
import { safeRedirectPath } from '../redirect';

const FIELDS = ['email', 'password'] as const;
type Field = (typeof FIELDS)[number];
const isField = (path: unknown): path is Field => FIELDS.includes(path as Field);

const GENERIC_ERROR = "Couldn't sign you in. Check your connection and try again.";

export function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useLogin();
  const form = useForm<LoginInput, unknown, LoginData>({
    resolver: zodResolver(LoginInputSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      await navigate(safeRedirectPath(searchParams.get('redirectTo')), { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        const fieldErrors = error.details.filter((detail) => isField(detail.path));
        for (const { path, message } of fieldErrors) form.setError(path as Field, { message });
        if (fieldErrors.length) return;
      }
      // INVALID_CREDENTIALS, RATE_LIMITED, … carry a message written for users (one message for a
      // wrong password and an unknown email). Failures without one get the generic copy.
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
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'login-email-error' : undefined}
          {...form.register('email')}
        />
        {errors.email && (
          <p id="login-email-error" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'login-password-error' : undefined}
          {...form.register('password')}
        />
        {errors.password && (
          <p id="login-password-error" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Logging in…' : 'Log in'}
      </Button>
    </form>
  );
}
