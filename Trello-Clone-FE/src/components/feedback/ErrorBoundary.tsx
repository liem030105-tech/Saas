import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { useRouteError } from 'react-router';

import { Button } from '@/components/ui/button';
import { captureException } from '@/lib/error-tracking';

export function ErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">Reload the page to try again.</p>
      <Button onClick={onRetry ?? (() => window.location.reload())}>Reload</Button>
    </div>
  );
}

/** The router's errorElement: reports the error a route threw, then shows the fallback. */
export function RouteErrorFallback() {
  const error = useRouteError();
  useEffect(() => captureException(error), [error]);
  return <ErrorFallback />;
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Last-resort boundary around the whole app; route errors use the router's errorElement. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(error, info.componentStack);
    captureException(error);
  }

  override render() {
    return this.state.hasError ? <ErrorFallback /> : this.props.children;
  }
}
