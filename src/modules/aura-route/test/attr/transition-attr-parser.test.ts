import { parseTransitionShortcutAttr } from '../../core/attr/transition-attr-parser';

describe('parseTransitionShortcutAttr', () => {
  it('returns null for unset or empty', () => {
    expect(parseTransitionShortcutAttr(null)).toBeNull();
    expect(parseTransitionShortcutAttr('')).toBeNull();
  });

  it('mirrors in/out for single hook', () => {
    expect(parseTransitionShortcutAttr('fade')).toEqual({ in: ['fade'], out: ['fade'] });
  });

  it('splits out, in for two hooks', () => {
    expect(parseTransitionShortcutAttr('fade, slide')).toEqual({ in: ['slide'], out: ['fade'] });
  });
});
