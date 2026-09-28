import { screen } from '@testing-library/react';

import { notFoundCase, pageCases } from '@/testing/data/routes';
import { renderApp } from '@/testing/render';

describe('router', () => {
  it.each(Object.values(pageCases))('renders the page at $path', async ({ path, heading }) => {
    renderApp(path);

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('renders NotFound at an unknown path, with a link home', async () => {
    renderApp(notFoundCase.path);

    expect(
      await screen.findByRole('heading', { level: 1, name: notFoundCase.heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute(
      'href',
      pageCases.home.path,
    );
  });
});
