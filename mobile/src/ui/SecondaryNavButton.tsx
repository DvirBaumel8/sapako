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
 * complaint.
 *
 * Always sized to its own text (no numberOfLines truncation): an equal-width
 * flex layout was tried next to force three of these onto one row, but
 * WebKit renders Hebrew noticeably wider than the Chrome build this was
 * tested in, so on a real phone the longest label ran out of room and
 * ellipsized into "פעילות אחרו…" — unreadable, and worse than just wrapping.
 * The caller is responsible for giving this room (e.g. a horizontally
 * scrolling row) rather than squeezing it.
 */
export function SecondaryNavButton({ label, onPress, style }: SecondaryNavButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      <Text style={styles.label}>{label}</Text>
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
