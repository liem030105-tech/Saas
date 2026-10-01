import { render, screen } from '@testing-library/react';

import { markdownSample, xssAttempts } from '@/testing/data/markdown';

import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders markdown: bold, lists, code and links that open in a new tab', () => {
    render(<Markdown>{markdownSample.source}</Markdown>);

    expect(screen.getByText(markdownSample.bold).tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(markdownSample.code).tagName).toBe('CODE');
    const link = screen.getByRole('link', { name: markdownSample.link.text });
    expect(link).toHaveAttribute('href', markdownSample.link.href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each(xssAttempts)('never renders $case', ({ source }) => {
    const { container } = render(<Markdown>{source}</Markdown>);

    expect(container.querySelector('script, iframe, img[onerror], [onerror]')).toBeNull();
    for (const link of container.querySelectorAll('a')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/^\s*javascript:/i);
    }
    expect(container.innerHTML).not.toMatch(/<script|onerror=|javascript:/i);
    expect((window as { __pwned?: boolean }).__pwned).toBeUndefined();
  });
});
