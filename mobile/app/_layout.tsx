import '../src/instrument';
import '../src/analytics';
import * as Sentry from '@sentry/react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

// A render error anywhere below this reaches Sentry either way (its global
// handlers catch it once it bubbles to the browser), but without a boundary
// here the user is left looking at a blank page with no way back in.
function ErrorFallback() {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>משהו השתבש. אפשר לנסות לרענן את הדף.</Text>
      <Pressable
        style={styles.errorButton}
        onPress={() => window.location.reload()}
      >
        <Text style={styles.errorButtonText}>רענון</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
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
    </Sentry.ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  errorText: { fontSize: 16, textAlign: 'center', color: '#1a1a1a' },
  errorButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  errorButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
