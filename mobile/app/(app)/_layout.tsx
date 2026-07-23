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
