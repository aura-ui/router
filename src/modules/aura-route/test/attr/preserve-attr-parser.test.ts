import { NO_PRESERVE, parsePreserveAttr } from '../../core/attr/preserve-attr-parser';

describe('parsePreserveAttr', () => {
  it('maps preserve values to view/data flags', () => {
    expect(parsePreserveAttr(null)).toEqual(NO_PRESERVE);
    expect(parsePreserveAttr('')).toEqual({ view: true, data: false });
    expect(parsePreserveAttr('view')).toEqual({ view: true, data: false });
    expect(parsePreserveAttr('data')).toEqual({ view: false, data: true });
    expect(parsePreserveAttr('all')).toEqual({ view: true, data: true });
    expect(parsePreserveAttr('unknown')).toEqual(NO_PRESERVE);
  });
});
