import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'sapako.accessToken';

// expo-secure-store has no browser/keychain equivalent on web, so it throws there.
// Web is a dev-preview convenience only (native ships via Expo Go/EAS), so
// localStorage is an acceptable stand-in just to unblock that path.

export function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(TOKEN_KEY, token);
    return Promise.resolve();
  }
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return Promise.resolve(localStorage.getItem(TOKEN_KEY));
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(TOKEN_KEY);
    return Promise.resolve();
  }
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}
