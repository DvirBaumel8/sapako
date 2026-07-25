import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { BranchProvider, useBranch } from '../../src/branch/BranchContext';

function Gate() {
  const { selectedBranch } = useBranch();
  const pathname = usePathname();
  // Gate wraps every route in this group, including /select-branch itself —
  // without this exception it redirects to /select-branch even while already
  // there, looping forever instead of letting that screen render.
  // Admin is reachable without a selected branch — management is a
  // branch-independent concern, not something scoped to "inside" one branch.
  if (!selectedBranch && pathname !== '/select-branch' && !pathname.startsWith('/admin')) {
    return <Redirect href="/select-branch" />;
  }
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'ספקים' }} />
      <Stack.Screen name="select-branch" options={{ title: 'בחירת סניף' }} />
      <Stack.Screen name="activity" options={{ title: 'פעילות אחרונה' }} />
      <Stack.Screen name="providers/[providerId]/order" options={{ title: '' }} />
      <Stack.Screen name="admin/index" options={{ title: 'ניהול' }} />
      <Stack.Screen name="admin/branches/new" options={{ title: 'הוספת סניף' }} />
      <Stack.Screen name="admin/providers/new" options={{ title: 'הוספת ספק' }} />
      <Stack.Screen name="admin/products/new" options={{ title: 'הוספת מוצר' }} />
      <Stack.Screen name="admin/users/index" options={{ title: 'משתמשים' }} />
      <Stack.Screen name="admin/users/new" options={{ title: 'הוספת משתמש' }} />
      <Stack.Screen name="admin/users/[userId]/access" options={{ title: 'הרשאות ספקים' }} />
    </Stack>
  );
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
