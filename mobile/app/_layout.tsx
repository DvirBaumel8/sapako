import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ensureRTL } from '../src/i18n/rtl';
import { AuthProvider } from '../src/auth/AuthContext';

const queryClient = new QueryClient();
const screenOptions = { headerShown: false };

export default function RootLayout() {
  const [isRtlReady, setIsRtlReady] = useState(I18nManager.isRTL);

  useEffect(() => {
    if (!I18nManager.isRTL) {
      // Fire-and-forget: on native this may trigger a full reload, which
      // remounts the app with isRTL already true (this instance is discarded).
      // We never await it — expo-updates' reloadAsync() can hang indefinitely
      // in a dev-client with no update service configured, and blocking on it
      // would leave the app stuck rendering nothing forever.
      ensureRTL();
    }
    setIsRtlReady(true);
  }, []);

  if (!isRtlReady) {
    return null;
  }
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <Stack screenOptions={screenOptions} />
          </SafeAreaView>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
