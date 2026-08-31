import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth/AuthContext';
import { AlertProvider } from '../src/ui/AlertProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // With the defaults every mount and every window focus refetched. The
      // branch product list is ~535 KB gzipped, so returning from WhatsApp
      // after publishing an order — the app's core loop — re-downloaded it,
      // as did navigating back to the providers list. On a slow connection
      // that is the difference between instant and a visible stall.
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      // Data still refreshes on demand: mutations invalidate the lists they
      // affect, and the providers list has pull-to-refresh.
    },
  },
});
const screenOptions = { headerShown: false };

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AlertProvider>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
              <Stack screenOptions={screenOptions} />
            </SafeAreaView>
          </AlertProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
