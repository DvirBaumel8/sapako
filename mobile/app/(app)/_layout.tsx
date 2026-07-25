import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { BranchProvider, useBranch } from '../../src/branch/BranchContext';

function Gate() {
  const { selectedBranch } = useBranch();
  const pathname = usePathname();
  // Gate wraps every route in this group, including /select-branch itself —
  // without this exception it redirects to /select-branch even while already
  // there, looping forever instead of letting that screen render.
  if (!selectedBranch && pathname !== '/select-branch') {
    return <Redirect href="/select-branch" />;
  }
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'ספקים' }} />
      <Stack.Screen name="select-branch" options={{ title: 'בחירת סניף' }} />
      <Stack.Screen name="activity" options={{ title: 'פעילות אחרונה' }} />
      <Stack.Screen name="providers/[providerId]/order" options={{ title: '' }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
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
