import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

export function ErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">Reload the page to try again.</p>
      <Button onClick={onRetry ?? (() => window.location.reload())}>Reload</Button>
    </div>
  );
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
    // Monitoring is added with D-23; until then the browser console is the only sink.
    // eslint-disable-next-line no-console
    console.error(error, info.componentStack);
  }

  override render() {
    return this.state.hasError ? <ErrorFallback /> : this.props.children;
  }
}
