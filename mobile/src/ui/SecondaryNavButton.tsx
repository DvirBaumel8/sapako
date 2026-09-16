import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from './theme';

interface SecondaryNavButtonProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * A flat tonal button: tinted fill, bold accent-colored text, no border or
 * shadow. Multi-color emoji icons were tried here first and dropped — full-
 * color pictographs (a beige-and-red folder, a grey-and-white clock) read as
 * visually noisy against one flat blue tint, which was the actual "ugly"
 * complaint. Text-only, evenly sized, is both cleaner and narrower, which is
 * what let three of these share one row instead of wrapping.
 */
export function SecondaryNavButton({ label, onPress, style }: SecondaryNavButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    backgroundColor: colors.accentSurface,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: '#dde6fd' },
  label: { color: colors.accent, fontWeight: '700', fontSize: 14, textAlign: 'center' },
});
