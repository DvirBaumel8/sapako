import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../../src/auth/AuthContext';

export default function AdminLayout() {
  const { role } = useAuth();
  if (role !== 'ADMIN') {
    return <Redirect href="/" />;
  }
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'ניהול' }} />
      <Stack.Screen name="branches/new" options={{ title: 'הוספת סניף' }} />
      <Stack.Screen name="providers/new" options={{ title: 'הוספת ספק' }} />
      <Stack.Screen name="products/new" options={{ title: 'הוספת מוצר' }} />
      <Stack.Screen name="users/index" options={{ title: 'משתמשים' }} />
      <Stack.Screen name="users/new" options={{ title: 'הוספת משתמש' }} />
      <Stack.Screen name="users/[userId]/access" options={{ title: 'הרשאות ספקים' }} />
    </Stack>
  );
}
