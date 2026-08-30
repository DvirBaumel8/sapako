import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth/AuthContext';
import { AlertProvider } from '../src/ui/AlertProvider';

const queryClient = new QueryClient();
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
