import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { captureException } from '@/lib/error-tracking';

import { ErrorBoundary, RouteErrorFallback } from './ErrorBoundary';

vi.mock('@/lib/error-tracking', () => ({ captureException: vi.fn() }));

const error = new Error('render failed');

function Throws(): never {
  throw error;
}

describe('error reporting', () => {
  beforeEach(() => {
    // React logs caught render errors; they are expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('the app boundary shows the fallback and reports the error', () => {
    render(
      <ErrorBoundary>
        <Throws />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it('the route error element shows the fallback and reports what the route threw', async () => {
    const router = createMemoryRouter([
      { path: '/', element: <Throws />, errorElement: <RouteErrorFallback /> },
    ]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(captureException).toHaveBeenCalledWith(error);
  });
});
