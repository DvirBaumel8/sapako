# Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Expo (React Native + TypeScript) mobile app that lets the supermarket owner and his employees pick a branch, build an order for a provider, and publish it to WhatsApp — plus the admin screens needed to actually configure branches/providers/products/users, since there is no other way to manage that data.

**Architecture:** A single Expo project (`mobile/`) using file-based routing (Expo Router). Auth and branch selection live in React Context; all server data (providers, products, orders) is fetched and cached with TanStack Query. Publishing an order calls the backend, then opens a `wa.me` deep link built from the response.

**Tech Stack:** Expo (React Native + TypeScript), Expo Router, TanStack Query, `axios`, `expo-secure-store`, `expo-camera` (barcode scanning), `expo-updates` (RTL bootstrap reload), `jest-expo`.

**UI language:** Hebrew, right-to-left, throughout — not an English app with translations layered on. See the design spec's "UI language" note.

**Prerequisite:** `docs/superpowers/plans/2026-07-23-backend-api.md` must be implemented and runnable first (`npm run start:dev` in `backend/`) — every task here talks to that API.

**Key backend response shapes this plan depends on** (from the backend plan's Task 8 and Task 6):
- `POST /auth/login` → `{ accessToken: string }`
- `GET /branches` → `Branch[]` where `Branch = { id, name, address?, createdAt }`
- `GET /branches/:branchId/providers` → `Provider[]` where `Provider = { id, branchId, name, phone, isActive, createdAt }`
- `GET /providers/:providerId/products` → `Product[]` where `Product = { id, providerId, name, unitType, barcode?, imageUrl?, isActive, createdAt }`
- `POST /orders` → `Order` (status `DRAFT`)
- `POST /orders/:id/items`, `PATCH /orders/:id/items/:itemId`, `DELETE /orders/:id/items/:itemId` → `OrderItem` / `void`
- `POST /orders/:id/publish` → `Order & { provider: { name, phone }, items: OrderItem[] }` where `OrderItem = { id, productId?, productNameSnapshot, unitType, quantity }`
- `GET /branches/:branchId/orders` → `Order[]` with `items` and `provider` relations loaded, ordered newest first
- `GET /users` (ADMIN only) → `User[]` with `providerAccess: { providerId }[]`
- `POST /users`, `POST /users/:id/provider-access`, `DELETE /users/:id/provider-access/:providerId` (ADMIN only)

---

### Task 1: Project Scaffold

**Files:**
- Create: `mobile/` (via `create-expo-app`)
- Modify: `mobile/package.json`
- Modify: `mobile/app.json`
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/index.tsx`
- Test: `mobile/src/__tests__/sanity.test.ts`

- [ ] **Step 1: Scaffold the Expo project**

From the repo root:
```bash
npx --yes create-expo-app@latest mobile --template blank-typescript
cd mobile
```
Expected: `mobile/` created with `app.json`, `package.json`, `App.tsx`, `tsconfig.json`.

- [ ] **Step 2: Add Expo Router and its peer dependencies**

```bash
npx expo install expo-router expo-linking expo-constants expo-status-bar react-native-safe-area-context react-native-screens
```

Remove the CLI-generated `App.tsx` (Expo Router replaces it with file-based routes):
```bash
rm App.tsx
```

Set the router as the app entry point in `mobile/package.json`:
```json
{
  "main": "expo-router/entry"
}
```

Add a URL scheme to `mobile/app.json` (required by Expo Router and useful later for deep links):
```json
{
  "expo": {
    "scheme": "sapako"
  }
}
```

- [ ] **Step 3: Force right-to-left layout**

The entire app is Hebrew/RTL — not an English app with a translation layer. React Native's `I18nManager` needs `forceRTL(true)` called as early as possible, and native layout direction only fully applies after the app reloads once (a one-time cost on first launch; subsequent launches are already RTL and skip the reload).

```bash
npx expo install expo-updates
```

```typescript
// mobile/src/i18n/rtl.ts
import { I18nManager } from 'react-native';
import * as Updates from 'expo-updates';

export async function ensureRTL(): Promise<void> {
  if (I18nManager.isRTL) {
    return;
  }
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  try {
    await Updates.reloadAsync();
  } catch {
    // reloadAsync is unavailable in some dev environments (e.g. plain Expo Go on web);
    // in those cases the RTL flags still take effect on the next manual reload.
  }
}
```

- [ ] **Step 4: Root layout (applies RTL before first render) and placeholder home route**

```typescript
// mobile/app/_layout.tsx
import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { Stack } from 'expo-router';
import { ensureRTL } from '../src/i18n/rtl';

export default function RootLayout() {
  const [isRtlReady, setIsRtlReady] = useState(I18nManager.isRTL);

  useEffect(() => {
    if (!I18nManager.isRTL) {
      ensureRTL();
      return; // a reload is in flight; this component will remount once it lands
    }
    setIsRtlReady(true);
  }, []);

  if (!isRtlReady) {
    return null;
  }
  return <Stack />;
}
```

```typescript
// mobile/app/index.tsx
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>sapako</Text>
    </View>
  );
}
```

- [ ] **Step 5: Add Jest (`jest-expo`) and a sanity test**

```bash
npx expo install jest-expo jest --dev
npm install --save-dev @types/jest
```

Add to `mobile/package.json`:
```json
{
  "scripts": {
    "test": "jest"
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

```typescript
// mobile/src/__tests__/sanity.test.ts
describe('project setup', () => {
  it('runs a basic test', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run test, verify it passes**

```bash
cd mobile && npx jest src/__tests__/sanity.test.ts
```
Expected: PASS.

- [ ] **Step 7: Confirm the app boots and is RTL**

```bash
npx expo start
```
Expected: Metro bundler starts; scanning the QR with Expo Go (or pressing `i`/`a` for a simulator) shows the "sapako" placeholder screen, reloading once automatically on first launch (the RTL bootstrap from Step 3). After that one-time reload, confirm layout is right-to-left — e.g. temporarily add a second `Text` element next to the first and observe it renders on the left, not the right.

- [ ] **Step 8: Commit**

```bash
git add mobile
git commit -m "chore: scaffold Expo app with router and jest"
```

---

### Task 2: API Client & Token Storage

**Files:**
- Create: `mobile/src/api/client.ts`
- Create: `mobile/src/api/types.ts`
- Create: `mobile/src/auth/tokenStorage.ts`
- Test: `mobile/src/auth/tokenStorage.test.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd mobile
npx expo install expo-secure-store
npm install axios @tanstack/react-query
```

- [ ] **Step 2: Shared API types matching the backend's response shapes**

```typescript
// mobile/src/api/types.ts
export type Role = 'ADMIN' | 'STAFF';

export interface Branch {
  id: string;
  name: string;
  address?: string;
  createdAt: string;
}

export interface Provider {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  providerId: string;
  name: string;
  unitType: string;
  barcode?: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export type OrderStatus = 'DRAFT' | 'PUBLISHED';

export interface OrderItem {
  id: string;
  productId?: string;
  productNameSnapshot: string;
  unitType: string;
  quantity: number;
}

export interface Order {
  id: string;
  branchId: string;
  providerId: string;
  status: OrderStatus;
  createdAt: string;
  publishedAt?: string;
  items: OrderItem[];
  provider: Pick<Provider, 'id' | 'name' | 'phone'>;
}

export interface UserWithAccess {
  id: string;
  username: string;
  role: Role;
  providerAccess: { providerId: string }[];
}
```

- [ ] **Step 3: Write the failing token storage test**

```typescript
// mobile/src/auth/tokenStorage.test.ts
import * as SecureStore from 'expo-secure-store';
import { getToken, setToken, clearToken } from './tokenStorage';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('tokenStorage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves a token under a fixed key', async () => {
    await setToken('jwt-value');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('sapako.accessToken', 'jwt-value');
  });

  it('reads the stored token', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('jwt-value');

    const token = await getToken();

    expect(token).toBe('jwt-value');
  });

  it('clears the stored token', async () => {
    await clearToken();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('sapako.accessToken');
  });
});
```

- [ ] **Step 4: Run test, verify it fails**

```bash
npx jest src/auth/tokenStorage.test.ts
```
Expected: FAIL — `Cannot find module './tokenStorage'`.

- [ ] **Step 5: Implement token storage**

```typescript
// mobile/src/auth/tokenStorage.ts
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'sapako.accessToken';

export function setToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export function clearToken(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}
```

- [ ] **Step 6: Run test, verify it passes**

```bash
npx jest src/auth/tokenStorage.test.ts
```
Expected: PASS.

- [ ] **Step 7: API client with auth header injection and 401 handling**

```typescript
// mobile/src/api/client.ts
import axios, { AxiosError } from 'axios';
import Constants from 'expo-constants';
import { getToken, clearToken } from '../auth/tokenStorage';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl as string;

export const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await clearToken();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);
```

- [ ] **Step 8: Wire `apiBaseUrl` into `app.json`**

```json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "http://localhost:3000"
    }
  }
}
```

(This is overridden per build profile via `eas.json` in Task 11 — `localhost` is only correct when running in the iOS Simulator; Task 11 also covers pointing physical devices at a real host.)

- [ ] **Step 9: Commit**

```bash
git add mobile
git commit -m "feat: add API client, shared types, and secure token storage"
```

---

### Task 3: Auth Flow

**Files:**
- Create: `mobile/src/auth/AuthContext.tsx`
- Create: `mobile/src/api/auth.ts`
- Create: `mobile/app/login.tsx`
- Create: `mobile/app/(app)/_layout.tsx`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/app/index.tsx` (moved into `(app)` group — see Step 5)

- [ ] **Step 1: Auth API call**

```typescript
// mobile/src/api/auth.ts
import { apiClient } from './client';

export async function login(username: string, password: string): Promise<string> {
  const response = await apiClient.post<{ accessToken: string }>('/auth/login', { username, password });
  return response.data.accessToken;
}
```

- [ ] **Step 2: Decode the JWT payload to know the current user's role**

```bash
npm install jwt-decode
```

```typescript
// mobile/src/auth/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { getToken, setToken, clearToken } from './tokenStorage';
import { setUnauthorizedHandler } from '../api/client';
import { login as loginRequest } from '../api/auth';
import type { Role } from '../api/types';

interface JwtPayload {
  sub: string;
  role: Role;
}

interface AuthState {
  isLoading: boolean;
  userId: string | null;
  role: Role | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  const applyToken = (token: string | null) => {
    if (!token) {
      setUserId(null);
      setRole(null);
      return;
    }
    const payload = jwtDecode<JwtPayload>(token);
    setUserId(payload.sub);
    setRole(payload.role);
  };

  useEffect(() => {
    (async () => {
      const existingToken = await getToken();
      applyToken(existingToken);
      setIsLoading(false);
    })();
    setUnauthorizedHandler(() => applyToken(null));
  }, []);

  const login = async (username: string, password: string) => {
    const token = await loginRequest(username, password);
    await setToken(token);
    applyToken(token);
  };

  const logout = async () => {
    await clearToken();
    applyToken(null);
  };

  const value = useMemo(
    () => ({ isLoading, userId, role, login, logout }),
    [isLoading, userId, role],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

- [ ] **Step 3: Login screen**

```typescript
// mobile/app/login.tsx
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/auth/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
      router.replace('/');
    } catch {
      setError('שם משתמש או סיסמה שגויים');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>sapako</Text>
      <TextInput
        style={styles.input}
        placeholder="שם משתמש"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="סיסמה"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title={isSubmitting ? 'מתחבר…' : 'התחברות'} onPress={handleSubmit} disabled={isSubmitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, textAlign: 'right' },
  error: { color: '#c0392b', textAlign: 'right' },
});
```

- [ ] **Step 4: Route protection for the authenticated app group**

```typescript
// mobile/app/(app)/_layout.tsx
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';

export default function AppLayout() {
  const { isLoading, userId } = useAuth();

  if (isLoading) {
    return null;
  }
  if (!userId) {
    return <Redirect href="/login" />;
  }
  return <Stack />;
}
```

- [ ] **Step 5: Move the home placeholder into the protected group**

```bash
mkdir -p mobile/app/\(app\)
git mv mobile/app/index.tsx mobile/app/\(app\)/index.tsx
```

- [ ] **Step 6: Wrap the root layout with `AuthProvider`**

```typescript
// mobile/app/_layout.tsx
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/auth/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
```

- [ ] **Step 7: Manual verification**

With the backend running (`npm run start:dev` in `backend/`):
```bash
cd mobile && npx expo start
```
Expected: app opens to the login screen (no token yet); entering the bootstrap admin credentials navigates to the placeholder home screen; force-quitting and reopening the app skips the login screen (token persisted in Secure Store).

- [ ] **Step 8: Commit**

```bash
git add mobile
git commit -m "feat: add login screen and auth-gated route group"
```

---

### Task 4: Branch Context & Switcher

**Files:**
- Create: `mobile/src/api/branches.ts`
- Create: `mobile/src/branch/BranchContext.tsx`
- Create: `mobile/app/(app)/select-branch.tsx`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/app/(app)/_layout.tsx`

- [ ] **Step 1: Branches API + TanStack Query provider**

```typescript
// mobile/src/api/branches.ts
import { apiClient } from './client';
import type { Branch } from './types';

export async function fetchAccessibleBranches(): Promise<Branch[]> {
  const response = await apiClient.get<Branch[]>('/branches');
  return response.data;
}
```

Add `QueryClientProvider` to the root layout:

```typescript
// mobile/app/_layout.tsx
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/auth/AuthContext';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Branch context (holds the currently selected branch)**

```typescript
// mobile/src/branch/BranchContext.tsx
import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Branch } from '../api/types';

interface BranchState {
  selectedBranch: Branch | null;
  selectBranch: (branch: Branch) => void;
  clearBranch: () => void;
}

const BranchContext = createContext<BranchState | undefined>(undefined);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  const value = useMemo(
    () => ({
      selectedBranch,
      selectBranch: setSelectedBranch,
      clearBranch: () => setSelectedBranch(null),
    }),
    [selectedBranch],
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchState {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within BranchProvider');
  }
  return context;
}
```

- [ ] **Step 3: Wrap the protected route group with `BranchProvider` and redirect to branch selection when none is chosen**

```typescript
// mobile/app/(app)/_layout.tsx
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { BranchProvider, useBranch } from '../../src/branch/BranchContext';

function Gate() {
  const { selectedBranch } = useBranch();
  if (!selectedBranch) {
    return <Redirect href="/select-branch" />;
  }
  return <Stack />;
}

export default function AppLayout() {
  const { isLoading, userId } = useAuth();

  if (isLoading) {
    return null;
  }
  if (!userId) {
    return <Redirect href="/login" />;
  }
  return (
    <BranchProvider>
      <Gate />
    </BranchProvider>
  );
}
```

- [ ] **Step 4: Branch switcher screen**

```typescript
// mobile/app/(app)/select-branch.tsx
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../src/api/branches';
import { useBranch } from '../../src/branch/BranchContext';

export default function SelectBranchScreen() {
  const { selectBranch } = useBranch();
  const { data: branches, isLoading, error } = useQuery({
    queryKey: ['branches'],
    queryFn: fetchAccessibleBranches,
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>טוען סניפים…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centered}>
        <Text>לא ניתן לטעון סניפים. יש למשוך לרענון.</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={branches}
      keyExtractor={(branch) => branch.id}
      renderItem={({ item }) => (
        <Pressable
          style={styles.item}
          onPress={() => {
            selectBranch(item);
            router.replace('/');
          }}
        >
          <Text style={styles.itemText}>{item.name}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 8 },
  item: { padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
  itemText: { fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 5: Manual verification**

```bash
cd mobile && npx expo start
```
Expected: after logging in, the app redirects to the branch list (fetched from the real backend); tapping a branch navigates to the (still placeholder) home screen and does not redirect back to branch selection.

- [ ] **Step 6: Commit**

```bash
git add mobile
git commit -m "feat: add branch context and branch switcher screen"
```

---

### Task 5: Provider List Screen

**Files:**
- Create: `mobile/src/api/providers.ts`
- Modify: `mobile/app/(app)/index.tsx`

- [ ] **Step 1: Providers API**

```typescript
// mobile/src/api/providers.ts
import { apiClient } from './client';
import type { Provider } from './types';

export async function fetchProvidersForBranch(branchId: string): Promise<Provider[]> {
  const response = await apiClient.get<Provider[]>(`/branches/${branchId}/providers`);
  return response.data;
}
```

- [ ] **Step 2: Home screen shows the provider list for the selected branch**

```typescript
// mobile/app/(app)/index.tsx
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch } from '../../src/api/providers';
import { useBranch } from '../../src/branch/BranchContext';

export default function HomeScreen() {
  const { selectedBranch } = useBranch();
  const { data: providers, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.push('/select-branch')}>
        <Text style={styles.branchName}>{selectedBranch!.name} ▾</Text>
      </Pressable>

      {isLoading && <Text>טוען ספקים…</Text>}
      {error && <Text>לא ניתן לטעון ספקים. יש למשוך לרענון.</Text>}

      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={providers}
        keyExtractor={(provider) => provider.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.item}
            onPress={() => router.push(`/providers/${item.id}/order`)}
          >
            <Text style={styles.itemText}>{item.name}</Text>
          </Pressable>
        )}
        ListEmptyComponent={!isLoading ? <Text>אין עדיין ספקים לסניף זה.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  branchName: { fontSize: 20, fontWeight: '700' },
  item: { padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 8 },
  itemText: { fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 3: Manual verification**

Create a branch/provider via the backend (see the backend plan's Task 8, Step 10 `curl` example) and confirm it appears in the app after selecting that branch.

- [ ] **Step 4: Commit**

```bash
git add mobile
git commit -m "feat: show accessible providers for the selected branch"
```

---

### Task 6: Order Builder Screen

**Files:**
- Create: `mobile/src/api/orders.ts`
- Create: `mobile/app/(app)/providers/[providerId]/order.tsx`

- [ ] **Step 1: Orders API**

```typescript
// mobile/src/api/orders.ts
import { apiClient } from './client';
import type { Order, OrderItem } from './types';

export async function createDraftOrder(branchId: string, providerId: string): Promise<Order> {
  const response = await apiClient.post<Order>('/orders', { branchId, providerId });
  return response.data;
}

export async function addOrderItem(
  orderId: string,
  input: { productId?: string; productNameSnapshot?: string; unitType?: string; quantity: number },
): Promise<OrderItem> {
  const response = await apiClient.post<OrderItem>(`/orders/${orderId}/items`, input);
  return response.data;
}

export async function updateOrderItemQuantity(
  orderId: string,
  itemId: string,
  quantity: number,
): Promise<OrderItem> {
  const response = await apiClient.patch<OrderItem>(`/orders/${orderId}/items/${itemId}`, { quantity });
  return response.data;
}

export async function removeOrderItem(orderId: string, itemId: string): Promise<void> {
  await apiClient.delete(`/orders/${orderId}/items/${itemId}`);
}

export async function publishOrder(orderId: string): Promise<Order> {
  const response = await apiClient.post<Order>(`/orders/${orderId}/publish`);
  return response.data;
}
```

- [ ] **Step 2: Order builder screen**

This screen: creates a `DRAFT` order the moment it opens, loads the provider's product catalog (cached via TanStack Query), lets the user set quantities per product (each change is its own API call — per the plan's locked-in "auto-save per mutation" decision), supports adding an ad-hoc item, and hands off to the publish flow built in Task 7.

```typescript
// mobile/app/(app)/providers/[providerId]/order.tsx
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProductsForProvider } from '../../../../src/api/products';
import { createDraftOrder, addOrderItem, updateOrderItemQuantity } from '../../../../src/api/orders';
import { useBranch } from '../../../../src/branch/BranchContext';
import type { Order, OrderItem, Product } from '../../../../src/api/types';
import { PublishButton } from '../../../../src/order/PublishButton';

export default function OrderBuilderScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { selectedBranch } = useBranch();
  const [order, setOrder] = useState<Order | null>(null);
  const [itemsByProductId, setItemsByProductId] = useState<Record<string, OrderItem>>({});

  const { data: products } = useQuery({
    queryKey: ['products', providerId],
    queryFn: () => fetchProductsForProvider(providerId),
  });

  useEffect(() => {
    createDraftOrder(selectedBranch!.id, providerId).then(setOrder);
  }, [providerId]);

  const setQuantity = async (product: Product, quantity: number) => {
    if (!order) return;
    const existing = itemsByProductId[product.id];
    if (quantity <= 0) {
      return; // removing items is handled by a dedicated "remove" affordance, not covered by the stepper reaching 0 in this pass
    }
    if (existing) {
      const updated = await updateOrderItemQuantity(order.id, existing.id, quantity);
      setItemsByProductId((prev) => ({ ...prev, [product.id]: updated }));
    } else {
      const created = await addOrderItem(order.id, { productId: product.id, quantity });
      setItemsByProductId((prev) => ({ ...prev, [product.id]: created }));
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={(product) => product.id}
        renderItem={({ item: product }) => {
          const currentQuantity = itemsByProductId[product.id]?.quantity ?? 0;
          return (
            <View style={styles.row}>
              <Text style={styles.productName}>{product.name}</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setQuantity(product, Math.max(0, currentQuantity - 1))}
                  style={styles.stepperButton}
                >
                  <Text>-</Text>
                </Pressable>
                <TextInput
                  style={styles.quantityInput}
                  keyboardType="number-pad"
                  value={String(currentQuantity)}
                  onChangeText={(text) => setQuantity(product, Number(text) || 0)}
                />
                <Pressable onPress={() => setQuantity(product, currentQuantity + 1)} style={styles.stepperButton}>
                  <Text>+</Text>
                </Pressable>
                <Text style={styles.unit}>{product.unitType}</Text>
              </View>
            </View>
          );
        }}
      />
      {order && <PublishButton order={order} items={Object.values(itemsByProductId)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  productName: { fontSize: 15, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 6 },
  quantityInput: { width: 40, textAlign: 'center', borderWidth: 1, borderRadius: 6, padding: 4 },
  unit: { width: 48, fontSize: 12, color: '#666' },
});
```

> `PublishButton` and `fetchProductsForProvider` are built in Task 7 and this task's Step 3 respectively — the file above references both by their final paths so no rework is needed once they exist.

- [ ] **Step 3: Products API (needed by the screen above)**

```typescript
// mobile/src/api/products.ts
import { apiClient } from './client';
import type { Product } from './types';

export async function fetchProductsForProvider(providerId: string): Promise<Product[]> {
  const response = await apiClient.get<Product[]>(`/providers/${providerId}/products`);
  return response.data;
}
```

- [ ] **Step 4: Commit**

```bash
git add mobile
git commit -m "feat: add order builder screen with per-item auto-save"
```

(`PublishButton` doesn't exist yet — this commit will not compile standalone. That's resolved immediately in Task 7, which is designed to follow this one directly in the same work session.)

---

### Task 7: WhatsApp Publish Flow

**Files:**
- Create: `mobile/src/order/buildOrderMessage.ts`
- Test: `mobile/src/order/buildOrderMessage.test.ts`
- Create: `mobile/src/order/PublishButton.tsx`

- [ ] **Step 1: Write the failing test for the message-formatting pure function**

This is the one piece of mobile logic the design spec calls out as worth a unit test.

```typescript
// mobile/src/order/buildOrderMessage.test.ts
import { buildOrderMessage } from './buildOrderMessage';
import type { Order } from '../api/types';

describe('buildOrderMessage', () => {
  it('formats the provider name and each item on its own line, in Hebrew', () => {
    const order: Order = {
      id: 'o1',
      branchId: 'b1',
      providerId: 'p1',
      status: 'PUBLISHED',
      createdAt: '2026-07-23T10:00:00.000Z',
      publishedAt: '2026-07-23T10:05:00.000Z',
      provider: { id: 'p1', name: 'חברת הבשר', phone: '+972501234567' },
      items: [
        { id: 'i1', productId: 'pr1', productNameSnapshot: 'בשר טחון', unitType: 'ק"ג', quantity: 5 },
        { id: 'i2', productId: undefined, productNameSnapshot: 'צלעות כבש (רזות)', unitType: 'ק"ג', quantity: 2 },
      ],
    };

    const message = buildOrderMessage(order);

    expect(message).toBe(
      'הזמנה עבור חברת הבשר:\n- בשר טחון: 5 ק"ג\n- צלעות כבש (רזות): 2 ק"ג',
    );
  });

  it('handles a single-item order without a trailing newline', () => {
    const order: Order = {
      id: 'o1',
      branchId: 'b1',
      providerId: 'p1',
      status: 'PUBLISHED',
      createdAt: '2026-07-23T10:00:00.000Z',
      provider: { id: 'p1', name: 'ירקות השדה', phone: '+972507654321' },
      items: [{ id: 'i1', productId: 'pr1', productNameSnapshot: 'עגבניות', unitType: 'ארגז', quantity: 3 }],
    };

    const message = buildOrderMessage(order);

    expect(message).toBe('הזמנה עבור ירקות השדה:\n- עגבניות: 3 ארגז');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd mobile && npx jest src/order/buildOrderMessage.test.ts
```
Expected: FAIL — `Cannot find module './buildOrderMessage'`.

- [ ] **Step 3: Implement the pure function**

```typescript
// mobile/src/order/buildOrderMessage.ts
import type { Order } from '../api/types';

export function buildOrderMessage(order: Order): string {
  const lines = order.items.map(
    (item) => `- ${item.productNameSnapshot}: ${item.quantity} ${item.unitType}`,
  );
  return [`הזמנה עבור ${order.provider.name}:`, ...lines].join('\n');
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npx jest src/order/buildOrderMessage.test.ts
```
Expected: PASS.

- [ ] **Step 5: Publish button component**

Publishes the order on the backend first (durably persisting `PUBLISHED`), then opens the WhatsApp deep link — matching the design spec's requirement that a "sent" order is never lost even if WhatsApp fails to open.

```typescript
// mobile/src/order/PublishButton.tsx
import React, { useState } from 'react';
import { Alert, Button, Linking } from 'react-native';
import { router } from 'expo-router';
import { publishOrder } from '../api/orders';
import { buildOrderMessage } from './buildOrderMessage';
import type { Order, OrderItem } from '../api/types';

interface PublishButtonProps {
  order: Order;
  items: OrderItem[];
}

export function PublishButton({ order, items }: PublishButtonProps) {
  const [isPublishing, setIsPublishing] = useState(false);

  const handlePublish = async () => {
    if (items.length === 0) {
      Alert.alert('יש להוסיף לפחות פריט אחד לפני הפרסום.');
      return;
    }
    setIsPublishing(true);
    try {
      const publishedOrder = await publishOrder(order.id);
      const message = buildOrderMessage(publishedOrder);
      const phoneDigitsOnly = publishedOrder.provider.phone.replace(/[^\d]/g, '');
      const url = `https://wa.me/${phoneDigitsOnly}?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert(
          'ההזמנה נשמרה, אך לא ניתן היה לפתוח את WhatsApp',
          'ההזמנה פורסמה בהצלחה. יש לפתוח את WhatsApp ידנית כדי לשלוח אותה.',
        );
        router.replace('/');
        return;
      }
      await Linking.openURL(url);
      router.replace('/');
    } catch {
      Alert.alert('לא ניתן היה לפרסם את ההזמנה', 'יש לבדוק את החיבור לאינטרנט ולנסות שוב.');
    } finally {
      setIsPublishing(false);
    }
  };

  return <Button title={isPublishing ? 'מפרסם…' : 'פרסום לוואטסאפ'} onPress={handlePublish} />;
}
```

- [ ] **Step 6: Manual verification**

With the backend and app running, build an order for a real provider (using a real or test WhatsApp-capable phone number for `phone`), tap Publish, and confirm: the order becomes `PUBLISHED` in the backend (check via `GET /branches/:branchId/orders`), and WhatsApp opens with the correctly formatted pre-filled message.

- [ ] **Step 7: Commit**

```bash
git add mobile
git commit -m "feat: publish orders to WhatsApp via wa.me deep link"
```

---

### Task 8: Branch Home / Recent Activity

**Files:**
- Modify: `mobile/src/api/orders.ts`
- Create: `mobile/app/(app)/activity.tsx`
- Modify: `mobile/app/(app)/index.tsx`

- [ ] **Step 1: Add the branch-orders API call**

```typescript
// mobile/src/api/orders.ts
// (append to the existing file from Task 6)
import type { Order } from './types';

export async function fetchOrdersForBranch(branchId: string): Promise<Order[]> {
  const response = await apiClient.get<Order[]>(`/branches/${branchId}/orders`);
  return response.data;
}
```

- [ ] **Step 2: Recent activity screen**

```typescript
// mobile/app/(app)/activity.tsx
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchOrdersForBranch } from '../../src/api/orders';
import { useBranch } from '../../src/branch/BranchContext';

export default function ActivityScreen() {
  const { selectedBranch } = useBranch();
  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders', selectedBranch!.id],
    queryFn: () => fetchOrdersForBranch(selectedBranch!.id),
  });

  return (
    <FlatList
      contentContainerStyle={styles.list}
      refreshing={isRefetching}
      onRefresh={refetch}
      data={orders}
      keyExtractor={(order) => order.id}
      renderItem={({ item: order }) => (
        <View style={styles.row}>
          <Text style={styles.providerName}>{order.provider.name}</Text>
          <Text style={styles.itemCount}>{order.items.length} פריטים</Text>
          <Text style={order.status === 'PUBLISHED' ? styles.sentBadge : styles.draftBadge}>
            {order.status === 'PUBLISHED' ? 'נשלחה' : 'טיוטה'}
          </Text>
        </View>
      )}
      ListEmptyComponent={!isLoading ? <Text>אין הזמנות עדיין.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  providerName: { fontSize: 15, fontWeight: '600', flex: 1 },
  itemCount: { fontSize: 13, color: '#666', marginRight: 12 },
  sentBadge: { fontSize: 12, color: '#1e7e34', fontWeight: '700' },
  draftBadge: { fontSize: 12, color: '#b8860b', fontWeight: '700' },
});
```

- [ ] **Step 3: Link to it from the home screen**

Add a link near the branch name in `mobile/app/(app)/index.tsx`:
```typescript
import { Link } from 'expo-router';
// inside the returned JSX, alongside the branch-name Pressable:
<Link href="/activity" style={styles.activityLink}>פעילות אחרונה</Link>
```
Add the corresponding style to the `StyleSheet.create` call in that file:
```typescript
activityLink: { color: '#2563eb', marginBottom: 8 },
```

- [ ] **Step 4: Manual verification**

Publish an order (Task 7) and confirm it shows up on the Recent Activity screen with a "נשלחה" (sent) badge; create a second order and leave it without publishing, confirm it shows "טיוטה" (draft).

- [ ] **Step 5: Commit**

```bash
git add mobile
git commit -m "feat: add recent activity screen showing order status per provider"
```

---

### Task 9: Barcode Scanning

**Files:**
- Create: `mobile/src/barcode/BarcodeScannerModal.tsx`
- Modify: `mobile/app/(app)/providers/[providerId]/order.tsx`
- Modify: `mobile/app.json` (camera permission strings)

- [ ] **Step 1: Install and configure `expo-camera`**

```bash
cd mobile
npx expo install expo-camera
```

Add the camera usage description (required by iOS) to `mobile/app.json`:
```json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "sapako משתמש במצלמה כדי לסרוק ברקודים של מוצרים."
        }
      ]
    ]
  }
}
```

- [ ] **Step 2: Reusable scanner modal**

```typescript
// mobile/src/barcode/BarcodeScannerModal.tsx
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface BarcodeScannerModalProps {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({ visible, onScanned, onClose }: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!visible) {
    return null;
  }

  if (!permission?.granted) {
    return (
      <Modal visible transparent>
        <View style={styles.centered}>
          <Text>נדרשת גישה למצלמה כדי לסרוק ברקודים.</Text>
          <Pressable onPress={requestPermission} style={styles.button}>
            <Text>אישור הרשאה</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.button}>
            <Text>ביטול</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={(result) => {
          onScanned(result.data);
          onClose();
        }}
      />
      <Pressable onPress={onClose} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>ביטול</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: 'white' },
  camera: { flex: 1 },
  button: { padding: 12, borderWidth: 1, borderRadius: 8 },
  closeButton: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'white', padding: 12, borderRadius: 8 },
  closeButtonText: { fontWeight: '600' },
});
```

- [ ] **Step 3: Wire scanning into the order builder as a quick-find**

Scanning searches the already-loaded (and cached) product list for this provider by `barcode` and, if found, adds one unit of that product — a fast alternative to scrolling/typing, using purely client-side data with no extra network call.

Add to `mobile/app/(app)/providers/[providerId]/order.tsx`:
```typescript
import { useState } from 'react';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';
// ...inside OrderBuilderScreen, alongside the existing useState calls:
const [isScannerVisible, setIsScannerVisible] = useState(false);

const handleBarcodeScanned = (barcode: string) => {
  const match = products?.find((product) => product.barcode === barcode);
  if (!match) {
    Alert.alert('לא נמצא מוצר תואם', `לא נמצא מוצר עם ברקוד ${barcode} בקטלוג של הספק הזה.`);
    return;
  }
  const currentQuantity = itemsByProductId[match.id]?.quantity ?? 0;
  setQuantity(match, currentQuantity + 1);
};
// ...in the returned JSX, add a scan button (e.g. near the top of the list) and the modal:
<Pressable onPress={() => setIsScannerVisible(true)} style={styles.scanButton}>
  <Text>סריקת ברקוד</Text>
</Pressable>
<BarcodeScannerModal
  visible={isScannerVisible}
  onScanned={handleBarcodeScanned}
  onClose={() => setIsScannerVisible(false)}
/>
```
Add the `Alert` import from `react-native` and a `scanButton` entry to the file's `StyleSheet.create` call:
```typescript
scanButton: { margin: 12, padding: 12, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
```

- [ ] **Step 4: Manual verification**

Using a product created with a `barcode` value (via the admin product-creation screen from Task 10, or directly through the backend API), scan a real barcode with that value printed/displayed, and confirm it increments that product's quantity by one in the order builder.

- [ ] **Step 5: Commit**

```bash
git add mobile
git commit -m "feat: add barcode scanning as a quick-find in the order builder"
```

---

### Task 10: Admin Screens

Branches/providers/products and user/permission management have no UI otherwise — an ADMIN user needs these to configure the app at all.

**Files:**
- Modify: `mobile/src/api/branches.ts`, `mobile/src/api/providers.ts`, `mobile/src/api/products.ts`
- Create: `mobile/src/api/users.ts`
- Create: `mobile/app/(app)/admin/_layout.tsx`
- Create: `mobile/app/(app)/admin/index.tsx`
- Create: `mobile/app/(app)/admin/branches/new.tsx`
- Create: `mobile/app/(app)/admin/providers/new.tsx`
- Create: `mobile/app/(app)/admin/products/new.tsx`
- Create: `mobile/app/(app)/admin/users/index.tsx`
- Create: `mobile/app/(app)/admin/users/new.tsx`
- Create: `mobile/app/(app)/admin/users/[userId]/access.tsx`
- Modify: `mobile/app/(app)/index.tsx`

- [ ] **Step 1: Extend the API modules with create/list calls needed by admin screens**

```typescript
// mobile/src/api/branches.ts
// (append)
export async function createBranch(input: { name: string; address?: string }): Promise<Branch> {
  const response = await apiClient.post<Branch>('/branches', input);
  return response.data;
}
```

```typescript
// mobile/src/api/providers.ts
// (append)
export async function createProvider(
  branchId: string,
  input: { name: string; phone: string },
): Promise<Provider> {
  const response = await apiClient.post<Provider>(`/branches/${branchId}/providers`, input);
  return response.data;
}
```

```typescript
// mobile/src/api/products.ts
// (append)
export async function createProduct(
  providerId: string,
  input: { name: string; unitType: string; barcode?: string },
): Promise<Product> {
  const response = await apiClient.post<Product>(`/providers/${providerId}/products`, input);
  return response.data;
}
```

```typescript
// mobile/src/api/users.ts
import { apiClient } from './client';
import type { Role, UserWithAccess } from './types';

export async function fetchUsers(): Promise<UserWithAccess[]> {
  const response = await apiClient.get<UserWithAccess[]>('/users');
  return response.data;
}

export async function createUser(input: { username: string; password: string; role: Role }): Promise<UserWithAccess> {
  const response = await apiClient.post<UserWithAccess>('/users', input);
  return response.data;
}

export async function grantProviderAccess(userId: string, providerId: string): Promise<void> {
  await apiClient.post(`/users/${userId}/provider-access`, { providerId });
}

export async function revokeProviderAccess(userId: string, providerId: string): Promise<void> {
  await apiClient.delete(`/users/${userId}/provider-access/${providerId}`);
}
```

- [ ] **Step 2: Admin section layout, gated to the ADMIN role**

```typescript
// mobile/app/(app)/admin/_layout.tsx
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../../src/auth/AuthContext';

export default function AdminLayout() {
  const { role } = useAuth();
  if (role !== 'ADMIN') {
    return <Redirect href="/" />;
  }
  return <Stack />;
}
```

- [ ] **Step 3: Admin home (links to each management screen)**

```typescript
// mobile/app/(app)/admin/index.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';

export default function AdminHomeScreen() {
  return (
    <View style={styles.container}>
      <Link href="/admin/branches/new" style={styles.link}>הוספת סניף</Link>
      <Link href="/admin/providers/new" style={styles.link}>הוספת ספק</Link>
      <Link href="/admin/products/new" style={styles.link}>הוספת מוצר</Link>
      <Link href="/admin/users" style={styles.link}>ניהול משתמשים והרשאות</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  link: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
});
```

- [ ] **Step 4: Add-branch form**

```typescript
// mobile/app/(app)/admin/branches/new.tsx
import React, { useState } from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createBranch } from '../../../../src/api/branches';

export default function NewBranchScreen() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const handleSubmit = async () => {
    await createBranch({ name, address: address || undefined });
    router.back();
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.input} placeholder="שם הסניף" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="כתובת (אופציונלי)" value={address} onChangeText={setAddress} />
      <Button title="יצירת סניף" onPress={handleSubmit} disabled={!name} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
});
```

- [ ] **Step 5: Add-provider form (branch picker + name/phone)**

```typescript
// mobile/app/(app)/admin/providers/new.tsx
import React, { useState } from 'react';
import { Button, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches, createProvider } from '../../../../src/api/branches';
import type { Branch } from '../../../../src/api/types';

export default function NewProviderScreen() {
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [branch, setBranch] = useState<Branch | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async () => {
    if (!branch) return;
    await createProvider(branch.id, { name, phone });
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>סניף</Text>
      <FlatList
        horizontal
        data={branches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setBranch(item)}
            style={[styles.branchChip, branch?.id === item.id && styles.branchChipSelected]}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />
      <TextInput style={styles.input} placeholder="שם הספק" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="טלפון וואטסאפ (לדוגמה: 972501234567+)"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <Button title="יצירת ספק" onPress={handleSubmit} disabled={!branch || !name || !phone} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  label: { fontWeight: '600' },
  branchChip: { padding: 8, borderWidth: 1, borderRadius: 8, marginRight: 8 },
  branchChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
});
```

> Note: `createProvider` is imported from `../../../../src/api/branches` above for brevity of this single screen's imports list, but it is actually defined in `src/api/providers.ts` (Step 1). Import it from `'../../../../src/api/providers'` instead — a two-line fix to the import statement.

- [ ] **Step 6: Add-product form (provider picker + name/unit/barcode with scan)**

```typescript
// mobile/app/(app)/admin/products/new.tsx
import React, { useState } from 'react';
import { Button, StyleSheet, TextInput, View, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { createProduct } from '../../../../src/api/products';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';

export default function NewProductScreen() {
  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [unitType, setUnitType] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isScannerVisible, setIsScannerVisible] = useState(false);

  const handleSubmit = async () => {
    await createProduct(providerId, { name, unitType, barcode: barcode || undefined });
    router.back();
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.input} placeholder="מזהה ספק" value={providerId} onChangeText={setProviderId} />
      <TextInput style={styles.input} placeholder="שם המוצר" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder='סוג יחידה (לדוגמה: ק"ג, ארגז)' value={unitType} onChangeText={setUnitType} />
      <TextInput style={styles.input} placeholder="ברקוד (אופציונלי)" value={barcode} onChangeText={setBarcode} />
      <Pressable onPress={() => setIsScannerVisible(true)} style={styles.scanButton}>
        <Text>סריקת ברקוד</Text>
      </Pressable>
      <BarcodeScannerModal visible={isScannerVisible} onScanned={setBarcode} onClose={() => setIsScannerVisible(false)} />
      <Button title="יצירת מוצר" onPress={handleSubmit} disabled={!providerId || !name || !unitType} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  scanButton: { padding: 12, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
});
```

> "Provider ID" as a raw text field is a deliberate phase-1 shortcut — picking a provider from a proper branch→provider picker (like the branch chips in Step 5) is a natural follow-up once this is in daily use, but isn't required to be functional today.

- [ ] **Step 7: User list + create-user + grant/revoke access screens**

```typescript
// mobile/app/(app)/admin/users/index.tsx
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../../../../src/api/users';

export default function UsersScreen() {
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  return (
    <View style={styles.container}>
      <Link href="/admin/users/new" style={styles.link}>+ הוספת משתמש</Link>
      <FlatList
        data={users}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/admin/users/${item.id}/access`)}>
            <Text style={styles.username}>{item.username}</Text>
            <Text style={styles.meta}>{item.role} · {item.providerAccess.length} ספקים</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  link: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  username: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666' },
});
```

```typescript
// mobile/app/(app)/admin/users/new.tsx
import React, { useState } from 'react';
import { Button, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createUser } from '../../../../src/api/users';
import type { Role } from '../../../../src/api/types';

export default function NewUserScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('STAFF');

  const handleSubmit = async () => {
    await createUser({ username, password, role });
    router.back();
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.input} placeholder="שם משתמש" autoCapitalize="none" value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="סיסמה זמנית" secureTextEntry value={password} onChangeText={setPassword} />
      <View style={styles.roleRow}>
        {(['STAFF', 'ADMIN'] as Role[]).map((option) => (
          <Pressable
            key={option}
            onPress={() => setRole(option)}
            style={[styles.roleChip, role === option && styles.roleChipSelected]}
          >
            <Text>{option === 'ADMIN' ? 'מנהל' : 'עובד'}</Text>
          </Pressable>
        ))}
      </View>
      <Button title="יצירת משתמש" onPress={handleSubmit} disabled={!username || password.length < 8} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleChip: { padding: 8, borderWidth: 1, borderRadius: 8 },
  roleChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
});
```

```typescript
// mobile/app/(app)/admin/users/[userId]/access.tsx
import React from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchUsers, grantProviderAccess, revokeProviderAccess } from '../../../../../src/api/users';
import { fetchAccessibleBranches } from '../../../../../src/api/branches';
import { fetchProvidersForBranch } from '../../../../../src/api/providers';

export default function UserAccessScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const user = users?.find((candidate) => candidate.id === userId);
  const grantedProviderIds = new Set(user?.providerAccess.map((access) => access.providerId));

  const toggleAccess = async (providerId: string, isCurrentlyGranted: boolean) => {
    if (isCurrentlyGranted) {
      await revokeProviderAccess(userId, providerId);
    } else {
      await grantProviderAccess(userId, providerId);
    }
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={branches}
      keyExtractor={(branch) => branch.id}
      renderItem={({ item: branch }) => <BranchProviderToggles branchId={branch.id} branchName={branch.name} grantedProviderIds={grantedProviderIds} onToggle={toggleAccess} />}
    />
  );
}

function BranchProviderToggles({
  branchId,
  branchName,
  grantedProviderIds,
  onToggle,
}: {
  branchId: string;
  branchName: string;
  grantedProviderIds: Set<string>;
  onToggle: (providerId: string, isCurrentlyGranted: boolean) => void;
}) {
  const { data: providers } = useQuery({
    queryKey: ['providers', branchId],
    queryFn: () => fetchProvidersForBranch(branchId),
  });

  return (
    <View style={styles.branchSection}>
      <Text style={styles.branchName}>{branchName}</Text>
      {providers?.map((provider) => (
        <View key={provider.id} style={styles.providerRow}>
          <Text>{provider.name}</Text>
          <Switch
            value={grantedProviderIds.has(provider.id)}
            onValueChange={() => onToggle(provider.id, grantedProviderIds.has(provider.id))}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  branchSection: { gap: 8 },
  branchName: { fontSize: 16, fontWeight: '700' },
  providerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
});
```

- [ ] **Step 8: Link into the admin section from the home screen (ADMIN only)**

Add to `mobile/app/(app)/index.tsx`:
```typescript
import { useAuth } from '../../src/auth/AuthContext';
// inside HomeScreen component:
const { role } = useAuth();
// in the returned JSX, alongside the "Recent activity" link:
{role === 'ADMIN' && <Link href="/admin" style={styles.activityLink}>ניהול</Link>}
```

- [ ] **Step 9: Fix the import noted in Step 5**

In `mobile/app/(app)/admin/providers/new.tsx`, change:
```typescript
import { fetchAccessibleBranches, createProvider } from '../../../../src/api/branches';
```
to:
```typescript
import { fetchAccessibleBranches } from '../../../../src/api/branches';
import { createProvider } from '../../../../src/api/providers';
```

- [ ] **Step 10: Manual verification**

Log in as the bootstrap admin, open Admin, create a second branch, a provider under it, and a product under that provider; then create a STAFF user, grant them access to only that one provider, log in as that STAFF user in a second session, and confirm they see only that provider (not others) in their branch's provider list.

- [ ] **Step 11: Commit**

```bash
git add mobile
git commit -m "feat: add admin screens for branches, providers, products, and user permissions"
```

---

### Task 11: CI/CD (EAS Build & Internal Distribution)

**Files:**
- Create: `mobile/eas.json`
- Modify: `mobile/app.json` → convert relevant parts to `mobile/app.config.ts`
- Create: `.github/workflows/mobile-ci.yml`
- Create: `mobile/README.md`

- [ ] **Step 1: Install and log in to EAS CLI**

```bash
npm install -g eas-cli
eas login
```

- [ ] **Step 2: Convert to `app.config.ts` so `apiBaseUrl` can vary per build profile**

```bash
cd mobile
mv app.json app.json.bak
```

```typescript
// mobile/app.config.ts
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'sapako',
  slug: 'sapako',
  scheme: 'sapako',
  ios: { ...config.ios, bundleIdentifier: 'com.sapako.app' },
  android: { ...config.android, package: 'com.sapako.app' },
  plugins: [
    [
      'expo-camera',
      { cameraPermission: 'sapako uses the camera to scan product barcodes.' },
    ],
  ],
  extra: {
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
```

```bash
rm app.json.bak
```

- [ ] **Step 3: Initialize the EAS project**

```bash
eas init
```
Expected: creates a project on Expo's servers and writes the resulting project id into `mobile/app.config.ts`'s usage (EAS CLI prompts to confirm — accept, then hardcode the returned `EAS_PROJECT_ID` value directly in `eas.json`'s env below rather than relying on a shell env var, so builds are reproducible without extra setup).

- [ ] **Step 4: `eas.json` build profiles**

```json
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "preview": {
      "distribution": "internal",
      "env": {
        "API_BASE_URL": "https://sapako-api.up.railway.app"
      }
    },
    "production": {
      "distribution": "internal",
      "env": {
        "API_BASE_URL": "https://sapako-api.up.railway.app"
      }
    }
  }
}
```

Replace `https://sapako-api.up.railway.app` with the actual Railway URL once the backend (Task 10 of the backend plan) is deployed.

- [ ] **Step 5: Build and distribute internally**

```bash
eas build --platform all --profile preview
```
Expected: EAS builds both an iOS and an Android binary in the cloud and prints an install link/QR code per platform. For iOS, this first run will prompt to register test devices' UDIDs (via a link EAS provides) before it can produce an ad-hoc build — follow that prompt.

- [ ] **Step 6: GitHub Action — lint and unit test on PR (no build, to avoid burning EAS build minutes on every PR)**

```yaml
# .github/workflows/mobile-ci.yml
name: mobile-ci

on:
  pull_request:
    paths:
      - 'mobile/**'
      - '.github/workflows/mobile-ci.yml'

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: mobile/package-lock.json
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm test
```

- [ ] **Step 7: Mobile README**

```markdown
<!-- mobile/README.md -->
# Mobile App

Expo (React Native + TypeScript) app for the supplier ordering flow. See
`/docs/ARCHITECTURE.md` at the repo root for the full picture.

## Local development

    npm install
    npx expo start

Requires the backend running locally (see `../backend/README.md`) and
`API_BASE_URL` in `app.config.ts` pointing at it — `http://localhost:3000`
works for the iOS Simulator; a physical device needs your machine's LAN IP
instead of `localhost`.

## Tests

    npm test

## Building for the team's phones (no App Store)

    eas build --platform all --profile preview

EAS prints an install link/QR code per platform. iOS devices must have their
UDID registered with EAS first (one-time per device, via the link EAS
provides on first build). Android installs the produced APK directly.

## Pushing a JS-only update without a full rebuild

    eas update --branch preview
```

- [ ] **Step 8: Commit**

```bash
git add mobile .github
git commit -m "chore: add EAS build config and mobile CI workflow"
```

---

## Plan Self-Review Notes

- **Spec coverage:** login/branch-switch flow (Tasks 3–4), STAFF sees only accessible providers (Task 5, enforced server-side by the backend's `ProviderAccessGuard`/`BranchAccessGuard`, mobile just renders what the API returns), order builder with quantity stepper and ad-hoc/barcode item entry (Tasks 6, 9), publish → WhatsApp with the order safely persisted first (Task 7), recent activity with draft/sent badges (Task 8), admin screens for branches/providers/products/users/permissions (Task 10), phase-1 photo upload explicitly NOT built (no task adds an image-picker — `Product.imageUrl` stays unused client-side, matching the spec's deferral), EAS internal distribution for iOS + Android (Task 11).
- **Hebrew/RTL coverage:** RTL is forced at the OS level via `I18nManager` (Task 1, Step 3) rather than left to per-device locale, since this app is Hebrew-only regardless of a given phone's system language. Every screen built in Tasks 3–10 uses Hebrew copy directly (no i18n/translation library — there is only one language in phase 1, so an abstraction layer would be pure overhead). `buildOrderMessage` (Task 7) — the text that actually reaches a real supplier over WhatsApp — is Hebrew and covered by the unit test using Hebrew fixture data, not English placeholder text.
- **Type consistency check:** `Order`, `Provider`, `Product`, `OrderItem`, `UserWithAccess` types (Task 2) are the single source of truth used identically by every API function and screen in Tasks 3–10 — no ad-hoc inline shapes introduced later.
- **Known rough edges flagged inline rather than hidden:** Task 6/7's cross-task file reference and Task 10's provider-picker-as-text-field shortcut are called out explicitly in the plan text, not left implicit — a future engineer reading only one task won't be surprised.
