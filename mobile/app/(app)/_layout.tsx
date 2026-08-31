import { Redirect, Stack, usePathname } from 'expo-router';
import { HeaderBackButton } from '../../src/ui/HeaderBackButton';
import { useAuth } from '../../src/auth/AuthContext';
import { BranchProvider, useBranch } from '../../src/branch/BranchContext';
import { SendConfirmationPrompt } from '../../src/order/SendConfirmationPrompt';

function Gate() {
  const { selectedBranch, isRestoring } = useBranch();
  const pathname = usePathname();
  // Wait for the persisted branch to be read back before deciding anything.
  // Without this the app redirects to /select-branch on every launch and only
  // restores the branch a tick later — a visible flash, and it discards the
  // route the user actually opened.
  if (isRestoring) {
    return null;
  }
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
      <Stack.Screen
        name="select-branch"
        options={{
          title: 'בחירת סניף',
          // Only once a branch is chosen. Before that this screen is the
          // destination — going "back" to / would just redirect straight here.
          headerLeft: selectedBranch
            ? () => <HeaderBackButton fallback="/" />
            : undefined,
        }}
      />
      <Stack.Screen name="activity" options={{ title: 'פעילות אחרונה', headerLeft: () => <HeaderBackButton fallback={'/'} /> }} />
      <Stack.Screen name="providers/[providerId]/order" options={{ title: '', headerLeft: () => <HeaderBackButton fallback={'/'} /> }} />
      <Stack.Screen name="providers/[providerId]/edit" options={{ title: 'עריכת ספק', headerLeft: () => <HeaderBackButton fallback={'/'} /> }} />
      <Stack.Screen name="departments/index" options={{ title: 'מחלקות', headerLeft: () => <HeaderBackButton fallback={'/'} /> }} />
      <Stack.Screen name="departments/new" options={{ title: 'הוספת מחלקה', headerLeft: () => <HeaderBackButton fallback={'/departments'} /> }} />
      <Stack.Screen name="departments/[departmentId]/edit" options={{ title: 'עריכת מחלקה', headerLeft: () => <HeaderBackButton fallback={'/departments'} /> }} />
      <Stack.Screen name="departments/[departmentId]/providers" options={{ title: '', headerLeft: () => <HeaderBackButton fallback={'/departments'} /> }} />
      <Stack.Screen name="departments/[departmentId]/add-provider" options={{ title: '', headerLeft: () => <HeaderBackButton fallback={'/departments'} /> }} />
      <Stack.Screen name="products/[productId]/edit" options={{ title: 'עריכת מוצר', headerLeft: () => <HeaderBackButton fallback={'/'} /> }} />
      <Stack.Screen name="admin/index" options={{ title: 'ניהול', headerLeft: () => <HeaderBackButton fallback={'/select-branch'} /> }} />
      <Stack.Screen name="admin/branches/new" options={{ title: 'הוספת סניף', headerLeft: () => <HeaderBackButton fallback={'/admin'} /> }} />
      <Stack.Screen name="admin/providers/new" options={{ title: 'הוספת ספק', headerLeft: () => <HeaderBackButton fallback={'/admin'} /> }} />
      <Stack.Screen name="admin/products/new" options={{ title: 'הוספת מוצר', headerLeft: () => <HeaderBackButton fallback={'/admin'} /> }} />
      <Stack.Screen name="admin/users/index" options={{ title: 'משתמשים', headerLeft: () => <HeaderBackButton fallback={'/admin'} /> }} />
      <Stack.Screen name="admin/users/new" options={{ title: 'הוספת משתמש', headerLeft: () => <HeaderBackButton fallback={'/admin/users'} /> }} />
      <Stack.Screen name="admin/users/[userId]/access" options={{ title: 'הרשאות ספקים', headerLeft: () => <HeaderBackButton fallback={'/admin/users'} /> }} />
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
      {/*
        Mounted at the layout, not on a screen: the user returns from WhatsApp
        to whatever screen they left, and an order nobody answered for must
        keep asking wherever they are.
      */}
      <SendConfirmationPrompt />
    </BranchProvider>
  );
}
