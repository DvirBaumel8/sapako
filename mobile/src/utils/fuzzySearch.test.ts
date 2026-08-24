import { fuzzySearch } from './fuzzySearch';

describe('fuzzySearch', () => {
  const items = ['חלב טרי', 'שוקולד חלבי', 'ביצה חלב', 'גבינה צהובה'];

  it('returns items unchanged for an empty query', () => {
    expect(fuzzySearch(items, '', (x) => x)).toEqual(items);
  });

  it('matches a multi-word query regardless of order', () => {
    expect(fuzzySearch(items, 'חלב ביצה', (x) => x)).toEqual(['ביצה חלב']);
  });

  it('ranks a whole-word match above a mid-word substring match', () => {
    const results = fuzzySearch(items, 'חלב', (x) => x);
    expect(results[0]).toBe('חלב טרי');
  });

  it('excludes items that do not contain every query token', () => {
    expect(fuzzySearch(items, 'גבינה כחולה', (x) => x)).toEqual([]);
  });
});
