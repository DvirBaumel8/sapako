import { router } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from './AuthContext';

// Convenience gating only — the server enforces the permission. Waits out the
// capability fetch so a staff editor isn't bounced before it resolves.
export function useRequireProductEditor(): void {
  const { canEditProducts, isCapabilityLoading } = useAuth();

  useEffect(() => {
    if (!isCapabilityLoading && !canEditProducts) {
      router.replace('/');
    }
  }, [canEditProducts, isCapabilityLoading]);
}
