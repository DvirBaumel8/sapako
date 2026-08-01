import { intersectDepartmentNames } from './departmentIntersection';

describe('intersectDepartmentNames', () => {
  it('returns all active names when given a single branch', () => {
    const result = intersectDepartmentNames([
      [
        { name: 'מוצרי חלב', isActive: true },
        { name: 'קפואים', isActive: true },
      ],
    ]);
    expect(result).toEqual(['מוצרי חלב', 'קפואים']);
  });

  it('returns only names common to every branch', () => {
    const result = intersectDepartmentNames([
      [
        { name: 'מוצרי חלב', isActive: true },
        { name: 'קפואים', isActive: true },
      ],
      [
        { name: 'מוצרי חלב', isActive: true },
        { name: 'פיצוחים', isActive: true },
      ],
    ]);
    expect(result).toEqual(['מוצרי חלב']);
  });

  it('excludes inactive departments from either side', () => {
    const result = intersectDepartmentNames([
      [
        { name: 'מוצרי חלב', isActive: false },
        { name: 'קפואים', isActive: true },
      ],
      [
        { name: 'מוצרי חלב', isActive: true },
        { name: 'קפואים', isActive: true },
      ],
    ]);
    expect(result).toEqual(['קפואים']);
  });

  it('returns an empty array when given no branches', () => {
    expect(intersectDepartmentNames([])).toEqual([]);
  });

  it('returns an empty array when branches share no active department', () => {
    const result = intersectDepartmentNames([
      [{ name: 'מוצרי חלב', isActive: true }],
      [{ name: 'קפואים', isActive: true }],
    ]);
    expect(result).toEqual([]);
  });
});
