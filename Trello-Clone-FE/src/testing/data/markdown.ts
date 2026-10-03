// Markdown component cases (CARD-002): what is rendered, and what must never reach the DOM.

export const markdownSample = {
  source: '**Steps**\n\n1. Open [the login page](https://example.test/login)\n2. Try `admin`',
  bold: 'Steps',
  link: { text: 'the login page', href: 'https://example.test/login' },
  code: 'admin',
};

/** Attempts to run script through a description; none may produce a script, handler or js URL. */
export const xssAttempts = [
  { case: 'a script tag', source: 'Hi <script>window.__pwned = true</script> there' },
  { case: 'an img onerror handler', source: '<img src=x onerror="window.__pwned = true">' },
  { case: 'a javascript: link', source: '[click me](javascript:window.__pwned=true)' },
  { case: 'an iframe', source: '<iframe src="https://evil.example"></iframe>' },
];

/** A comment with a mention (D-28) and a mention-looking link that tries to run script. */
export const mentionSample = {
  source:
    'Thanks @[Ada Lovelace](mention:clx0000000000000000000003) and [x](mention:javascript:alert(1))',
  name: 'Ada Lovelace',
};
