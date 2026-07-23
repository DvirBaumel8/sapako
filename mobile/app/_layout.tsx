import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ensureRTL } from '../src/i18n/rtl';
import { AuthProvider } from '../src/auth/AuthContext';

const queryClient = new QueryClient();

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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
