// Mentions in comments (D-28, docs/api/notifications.md → Triggers): `@[Name](mention:<userId>)`,
// inserted by the comment composer's `@` picker. The server reads the ids to notify; the FE
// renders the link as a name chip. Both sides use these.

/** The link protocol a mention uses (markdown `[Name](mention:<userId>)`). */
export const MENTION_PROTOCOL = 'mention:';

const MENTION = /@\[[^\]]*\]\(mention:([a-z0-9]{20,32})\)/g;

/** The token for `name` (brackets dropped so the markdown stays one link). */
export function formatMention(name: string, userId: string): string {
  return `@[${name.replace(/[[\]]/g, '')}](${MENTION_PROTOCOL}${userId})`;
}

/** The user ids `content` mentions, each once, in order of appearance. */
export function mentionedUserIds(content: string): string[] {
  return [...new Set([...content.matchAll(MENTION)].map((match) => match[1]!))];
}
