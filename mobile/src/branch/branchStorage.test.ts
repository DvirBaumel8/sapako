import { Platform } from 'react-native';
import { saveBranch, loadBranch, clearStoredBranch } from './branchStorage';
import type { Branch } from '../api/types';

const branch: Branch = {
  id: 'branch-1',
  name: 'Hills',
  createdAt: '2026-08-30T00:00:00.000Z',
};

describe('branchStorage on web', () => {
  const originalOS = Platform.OS;
  // A real store rather than bare jest.fn()s, so the round-trip and clear
  // tests exercise actual persistence instead of asserting on call arguments.
  let store: Record<string, string> = {};
  const localStorageMock = {
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    getItem: (k: string) => (k in store ? store[k] : null),
    removeItem: (k: string) => {
      delete store[k];
    },
  };

  beforeAll(() => {
    Platform.OS = 'web';
    (globalThis as unknown as { localStorage: typeof localStorageMock }).localStorage =
      localStorageMock;
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  beforeEach(() => {
    store = {};
  });

  it('round-trips a branch through storage', async () => {
    await saveBranch(branch);
    await expect(loadBranch()).resolves.toEqual(branch);
  });

  it('returns null when nothing has been stored', async () => {
    await expect(loadBranch()).resolves.toBeNull();
  });

  it('clears a stored branch', async () => {
    await saveBranch(branch);
    await clearStoredBranch();
    await expect(loadBranch()).resolves.toBeNull();
  });

  it('returns null rather than throwing when the stored value is not valid JSON', async () => {
    // Storage survives deploys and is shared with the rest of the origin, so a
    // corrupt or stale value must not brick the app on launch.
    store['sapako.selectedBranch'] = '{not json';
    await expect(loadBranch()).resolves.toBeNull();
  });

  it('returns null when the stored value is JSON but not a branch', async () => {
    store['sapako.selectedBranch'] = '{"unexpected":true}';
    await expect(loadBranch()).resolves.toBeNull();
  });
});
