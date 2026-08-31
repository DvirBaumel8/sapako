import { resolveAccess } from './resolveAccess';

const input = {
  directProviderIds: [] as string[],
  blockedProviderIds: [] as string[],
  grantedDepartmentIds: [] as string[],
  departmentsByProviderId: {} as Record<string, { id: string; name: string }[]>,
};

describe('resolveAccess', () => {
  it('denies a provider with no rule at all', () => {
    expect(resolveAccess('p1', input)).toEqual({ isGranted: false, reason: 'NONE' });
  });

  it('grants a directly granted provider', () => {
    expect(resolveAccess('p1', { ...input, directProviderIds: ['p1'] })).toEqual({
      isGranted: true,
      reason: 'DIRECT',
    });
  });

  it('grants a provider through a granted department', () => {
    expect(
      resolveAccess('p1', {
        ...input,
        grantedDepartmentIds: ['d1'],
        departmentsByProviderId: { p1: [{ id: 'd1', name: 'חלב' }] },
      }),
    ).toEqual({ isGranted: true, reason: 'DEPARTMENT', viaDepartmentName: 'חלב' });
  });

  it('lets a block beat a direct grant', () => {
    // Block wins over everything: any weaker order makes an exception
    // unreliable, which is the only reason exceptions exist.
    expect(
      resolveAccess('p1', {
        ...input,
        directProviderIds: ['p1'],
        blockedProviderIds: ['p1'],
      }),
    ).toEqual({ isGranted: false, reason: 'BLOCKED' });
  });

  it('lets a block beat a department grant, and says which department', () => {
    expect(
      resolveAccess('p1', {
        ...input,
        blockedProviderIds: ['p1'],
        grantedDepartmentIds: ['d1'],
        departmentsByProviderId: { p1: [{ id: 'd1', name: 'חלב' }] },
      }),
    ).toEqual({ isGranted: false, reason: 'BLOCKED', viaDepartmentName: 'חלב' });
  });

  it('reports a dormant block as a plain denial', () => {
    // Blocked, but no department currently grants it: there is nothing to
    // explain, so the screen shows an ordinary off switch.
    expect(
      resolveAccess('p1', {
        ...input,
        blockedProviderIds: ['p1'],
        departmentsByProviderId: { p1: [{ id: 'd1', name: 'חלב' }] },
      }),
    ).toEqual({ isGranted: false, reason: 'BLOCKED' });
  });

  it('grants when any one of several departments is granted', () => {
    expect(
      resolveAccess('p1', {
        ...input,
        grantedDepartmentIds: ['d2'],
        departmentsByProviderId: {
          p1: [{ id: 'd1', name: 'חלב' }, { id: 'd2', name: 'ירקות' }],
        },
      }),
    ).toEqual({ isGranted: true, reason: 'DEPARTMENT', viaDepartmentName: 'ירקות' });
  });

  it('names the alphabetically first granted department when several apply', () => {
    // One of several true answers; chosen deterministically so the
    // explanatory line does not change between reads.
    expect(
      resolveAccess('p1', {
        ...input,
        grantedDepartmentIds: ['d1', 'd2'],
        departmentsByProviderId: {
          p1: [{ id: 'd2', name: 'ירקות' }, { id: 'd1', name: 'חלב' }],
        },
      }).viaDepartmentName,
    ).toBe('חלב');
  });

  it('prefers a direct grant over a department for the stated reason', () => {
    expect(
      resolveAccess('p1', {
        ...input,
        directProviderIds: ['p1'],
        grantedDepartmentIds: ['d1'],
        departmentsByProviderId: { p1: [{ id: 'd1', name: 'חלב' }] },
      }).reason,
    ).toBe('DIRECT');
  });
});
