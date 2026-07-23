import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { Stack } from 'expo-router';
import { ensureRTL } from '../src/i18n/rtl';
import { AuthProvider } from '../src/auth/AuthContext';

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
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
