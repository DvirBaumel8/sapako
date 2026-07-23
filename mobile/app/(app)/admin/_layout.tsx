import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../../src/auth/AuthContext';

export default function AdminLayout() {
  const { role } = useAuth();
  if (role !== 'ADMIN') {
    return <Redirect href="/" />;
  }
  return <Stack />;
}
