import { BOARD_BACKGROUNDS, contrastRatio, DARK_TEXT, readableTextColor } from './colors';

describe('readableTextColor', () => {
  it.each(BOARD_BACKGROUNDS)('text on $name passes WCAG AA for normal text', ({ value }) => {
    expect(contrastRatio(value, readableTextColor(value))).toBeGreaterThanOrEqual(4.5);
  });

  it('uses white on dark colours and near-black on light ones', () => {
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#ffffff')).toBe(DARK_TEXT);
  });
});
