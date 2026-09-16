/// <reference types="node" />
// Runs under Jest's Node environment and reads the filesystem directly
// rather than rendering the router, so it needs Node's ambient types — the
// app's own tsconfig deliberately restricts `types` to `jest` so RN/web code
// never accidentally calls a Node-only API.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Deliberately kept out of app/ entirely, not just renamed. expo-router
 * treats any file matching `_layout.*` as a layout route — even
 * `_layout.test.tsx` — and layout routes are always eagerly evaluated to
 * build the navigation tree, unlike ordinary screens which are lazy. A test
 * file co-located as `app/(app)/_layout.test.*` therefore isn't just risky
 * in the dev server (where every route is eagerly validated); it broke the
 * real production export too, crashing the whole app on load. Confirmed by
 * reproducing it live before moving this file here.
 *
 * A screen that exists as a route file but has no matching <Stack.Screen>
 * entry in Gate still renders — expo-router falls back to a default header
 * with no title (showing the raw file-path route name instead) and no back
 * button, because every other screen here gets both only by opting in
 * explicitly. That's an easy thing to forget when adding a new screen, and
 * has happened before (admin/users/[userId]/edit shipped without one), so
 * this check makes the omission fail CI instead of shipping quietly.
 */
const APP_GROUP_DIR = join(__dirname, '../../app/(app)');
const LAYOUT_PATH = join(APP_GROUP_DIR, '_layout.tsx');

function collectRouteNames(dir: string, baseDir: string): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      names.push(...collectRouteNames(fullPath, baseDir));
      continue;
    }
    if (!entry.endsWith('.tsx') || entry === '_layout.tsx' || entry.includes('.test.')) {
      continue;
    }
    const routeName = relative(baseDir, fullPath).replace(/\.tsx$/, '');
    names.push(routeName);
  }
  return names;
}

it('registers a <Stack.Screen> for every route file, so each gets a real title and a back button', () => {
  const routeNames = collectRouteNames(APP_GROUP_DIR, APP_GROUP_DIR);

  const layoutSource = readFileSync(LAYOUT_PATH, 'utf8');
  const declaredNames = [...layoutSource.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map(
    (match) => match[1],
  );

  const missing = routeNames.filter((name) => !declaredNames.includes(name));
  expect(missing).toEqual([]);
});
