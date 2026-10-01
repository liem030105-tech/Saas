import { describe, expect, it } from 'vitest';

import {
  ChecklistItemContentSchema,
  ChecklistTitleSchema,
  UpdateChecklistInputSchema,
  UpdateChecklistItemInputSchema,
} from './checklists';

describe('ChecklistTitleSchema / ChecklistItemContentSchema', () => {
  it('trim, and refuse blank or too long text', () => {
    expect(ChecklistTitleSchema.parse('  Launch ')).toBe('Launch');
    expect(ChecklistItemContentSchema.parse(' Write docs ')).toBe('Write docs');
    for (const bad of ['', '   ', 't'.repeat(101)]) {
      expect(ChecklistTitleSchema.safeParse(bad).success).toBe(false);
    }
    expect(ChecklistItemContentSchema.safeParse('c'.repeat(500)).success).toBe(true);
    expect(ChecklistItemContentSchema.safeParse('c'.repeat(501)).success).toBe(false);
  });
});

describe('update schemas', () => {
  it.each([{ title: 'Launch' }, { position: 512 }])('a checklist accepts %j', (input) => {
    expect(UpdateChecklistInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([{}, { position: 0 }, { title: ' ' }])('a checklist refuses %j', (input) => {
    expect(UpdateChecklistInputSchema.safeParse(input).success).toBe(false);
  });

  it.each([{ done: true }, { content: 'Docs' }, { position: 1.5 }])(
    'an item accepts %j',
    (input) => {
      expect(UpdateChecklistItemInputSchema.safeParse(input).success).toBe(true);
    },
  );

  it.each([{}, { done: 'yes' }, { position: -1 }])('an item refuses %j', (input) => {
    expect(UpdateChecklistItemInputSchema.safeParse(input).success).toBe(false);
  });
});
