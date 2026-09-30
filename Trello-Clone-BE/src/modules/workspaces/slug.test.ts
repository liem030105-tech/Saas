import { describe, expect, it } from 'vitest';

import { slugCandidates, slugify } from './slug';
import { suffixedSlug, workspaceNames } from '../../../tests/data/workspaces';

const { acme, accented, noLatin, short, long } = workspaceNames;

describe('slugify', () => {
  it('kebab-cases the name', () => {
    expect(slugify(acme.input)).toBe(acme.slug);
  });

  it('drops accents', () => {
    expect(slugify(accented.input)).toBe(accented.slug);
  });

  it('falls back to "workspace" when nothing usable is left', () => {
    expect(slugify(noLatin.input)).toBe('workspace');
  });

  it('keeps at most 45 chars and never ends with a hyphen', () => {
    const slug = slugify(long.input);
    expect(slug.length).toBeLessThanOrEqual(45);
    expect(slug).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
  });
});

describe('slugCandidates', () => {
  it('tries the plain slug first, then new random suffixes', () => {
    const [first, ...rest] = slugCandidates(acme.input, 4);

    expect(first).toBe(acme.slug);
    expect(rest).toHaveLength(3);
    for (const slug of rest) expect(slug).toMatch(suffixedSlug(acme.slug));
    expect(new Set(rest).size).toBe(3);
  });

  it('adds a suffix right away when the slug would be too short', () => {
    expect(slugCandidates(short.input, 1)[0]).toMatch(suffixedSlug('a'));
  });

  it('always yields slugs valid for the API rule (3–50 chars)', () => {
    for (const { input } of Object.values(workspaceNames)) {
      for (const slug of slugCandidates(input, 3)) {
        expect(slug).toMatch(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/);
      }
    }
  });
});
