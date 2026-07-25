import { router } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from './AuthContext';

export function useRequireAdmin(): void {
  const { role } = useAuth();

  useEffect(() => {
    if (role !== 'ADMIN') {
      router.replace('/');
    }
  }, [role]);
}
