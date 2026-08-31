import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';

interface HeaderBackButtonProps {
  /** Where to go when there is nothing to go back to. */
  fallback: string;
}

/**
 * A back control that always works.
 *
 * The navigator's own back button only appears when it has a previous screen
 * in its stack. An installed web app is a fresh page load every launch, and
 * in standalone mode there is no browser back button either — so opening any
 * inner screen cold left the user with no way out at all.
 *
 * The chevron points right because the app is right-to-left: back is towards
 * the start of the reading direction.
 */
export function HeaderBackButton({ fallback }: HeaderBackButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="חזרה"
      hitSlop={16}
      style={styles.button}
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
          return;
        }
        router.replace(fallback);
      }}
    >
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 12, paddingVertical: 4 },
  chevron: { fontSize: 30, lineHeight: 34, color: '#2563eb', fontWeight: '400' },
});
