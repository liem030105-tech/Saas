import type { LabelDto } from '@trello-clone/shared';

// Label colours (docs/design/ui.md → Colours): the API accepts any #rrggbb, the UI offers only
// these presets. Names are for screen readers and for a label without a name.
export const LABEL_COLORS = [
  { name: 'Green', value: '#61bd4f' },
  { name: 'Yellow', value: '#f2d600' },
  { name: 'Orange', value: '#ff9f1a' },
  { name: 'Red', value: '#eb5a46' },
  { name: 'Purple', value: '#c377e0' },
  { name: 'Blue', value: '#0079bf' },
  { name: 'Sky', value: '#00c2e0' },
  { name: 'Lime', value: '#51e898' },
  { name: 'Pink', value: '#ff78cb' },
  { name: 'Black', value: '#344563' },
] as const;

/** A colour's preset name, or the hex value for a colour set outside the UI. */
export const colorName = (color: string) =>
  LABEL_COLORS.find((preset) => preset.value === color.toLowerCase())?.name ?? color;

/** What a label reads as: its name, or its colour for a colour-only label. */
export const labelText = (label: Pick<LabelDto, 'name' | 'color'>) =>
  label.name || `${colorName(label.color)} label`;

/** Labels in the order the API lists them (by id), e.g. after an optimistic insert. */
export const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
