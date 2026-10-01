import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import { cn } from '@/lib/utils';

interface MarkdownProps {
  /** Raw markdown as stored (card descriptions, comments). */
  children: string;
  className?: string;
}

/**
 * The only place user markdown is rendered (docs/architecture/security.md → Markdown). Raw HTML in
 * the text is never rendered as HTML, the output goes through `rehype-sanitize` (GitHub's
 * allowlist: no scripts, event handlers or `javascript:` URLs), and links open in a new tab
 * without access to this page. Never use `dangerouslySetInnerHTML` instead.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        'space-y-2 text-sm break-words',
        '[&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold',
        '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        className,
      )}
    >
      <ReactMarkdown
        skipHtml
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children: text }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {text}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
