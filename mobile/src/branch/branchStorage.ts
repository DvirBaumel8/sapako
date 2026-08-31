import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Branch } from '../api/types';

const BRANCH_KEY = 'sapako.selectedBranch';

// Mirrors tokenStorage's platform split. The branch is not a secret, but
// reusing the same mechanism avoids introducing a second storage dependency
// for one value.

function isBranch(value: unknown): value is Branch {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Branch).id === 'string' &&
    typeof (value as Branch).name === 'string'
  );
}

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(BRANCH_KEY);
  }
  return SecureStore.getItemAsync(BRANCH_KEY);
}

export async function saveBranch(branch: Branch): Promise<void> {
  const serialized = JSON.stringify(branch);
  if (Platform.OS === 'web') {
    localStorage.setItem(BRANCH_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(BRANCH_KEY, serialized);
}

export async function loadBranch(): Promise<Branch | null> {
  const raw = await readRaw();
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    // Storage persists across deploys and is shared with the rest of the
    // origin, so a stale or corrupt value must not brick the app on launch.
    // Falling back to null just sends the user to branch selection.
    return isBranch(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearStoredBranch(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(BRANCH_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(BRANCH_KEY);
}
