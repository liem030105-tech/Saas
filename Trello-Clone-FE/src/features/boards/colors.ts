// Board backgrounds (docs/design/ui.md → Colours): the API accepts any #rrggbb, the UI offers
// only these presets. Names are for screen readers.
export const BOARD_BACKGROUNDS = [
  { name: 'Blue', value: '#0079bf' },
  { name: 'Orange', value: '#d29034' },
  { name: 'Green', value: '#519839' },
  { name: 'Red', value: '#b04632' },
  { name: 'Purple', value: '#89609e' },
  { name: 'Pink', value: '#cd5a91' },
  { name: 'Lime', value: '#4bbf6b' },
  { name: 'Sky', value: '#00aecc' },
  { name: 'Grey', value: '#838c91' },
] as const;

export const DEFAULT_BOARD_BACKGROUND = BOARD_BACKGROUNDS[0].value;

const WHITE = '#ffffff';
/** Near-black used for text on light backgrounds. */
export const DARK_TEXT = '#111111';

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two #rrggbb colours (1–21). */
export function contrastRatio(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** White or near-black, whichever reads better on `background` (ui.md: WCAG AA). */
export const readableTextColor = (background: string) =>
  contrastRatio(background, WHITE) >= contrastRatio(background, DARK_TEXT) ? WHITE : DARK_TEXT;
