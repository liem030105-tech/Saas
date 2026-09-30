import { randomInt } from 'node:crypto';

// Slugs (docs/api/README.md → Validation rules): 3–50 chars, lower-case letters, digits and inner
// hyphens. Generated from the name; a random 4-char suffix is added on collision (WORKSPACE-001).

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SUFFIX_LENGTH = 4;
/** Leaves room for "-" + suffix within the 50-char limit. */
const MAX_BASE_LENGTH = 50 - 1 - SUFFIX_LENGTH;
const MIN_LENGTH = 3;
const FALLBACK_BASE = 'workspace';

/** Kebab-case of the name, ASCII only (accents dropped), at most 45 chars; "workspace" if nothing is left. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/^-+|-+$/g, '');
  return base || FALLBACK_BASE;
}

export const randomSuffix = () =>
  Array.from(
    { length: SUFFIX_LENGTH },
    () => SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)],
  ).join('');

/**
 * Slug candidates for a name, in order: the plain slug (when long enough), then the slug with a new
 * random suffix per attempt.
 */
export function slugCandidates(name: string, attempts: number): string[] {
  const base = slugify(name);
  const withSuffix = () => `${base}-${randomSuffix()}`;
  const first = base.length >= MIN_LENGTH ? base : withSuffix();
  return [first, ...Array.from({ length: attempts - 1 }, withSuffix)];
}
