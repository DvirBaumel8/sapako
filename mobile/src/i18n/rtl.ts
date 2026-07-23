import { I18nManager } from 'react-native';
import * as Updates from 'expo-updates';

export async function ensureRTL(): Promise<void> {
  if (I18nManager.isRTL) {
    return;
  }
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  try {
    await Updates.reloadAsync();
  } catch {
    // reloadAsync is unavailable in some dev environments (e.g. plain Expo Go on web);
    // in those cases the RTL flags still take effect on the next manual reload.
  }
}
