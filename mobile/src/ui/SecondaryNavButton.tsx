import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from './theme';

interface SecondaryNavButtonProps {
  label: string;
  icon: string;
  onPress: () => void;
}

/**
 * The top-level nav row (Recent Activity / Departments / Scan Barcode /
 * Admin) used to be plain colored text on a flat tint — visually identical
 * to `common.chip`, which is a filter/selection tag elsewhere in the app,
 * not a navigation control. A user reported not realizing these were
 * tappable at all. A border, a shadow to lift it off the background, a
 * leading icon, and larger text/padding give it the "this is a button" cues
 * chip never needed to have.
 */
export function SecondaryNavButton({ label, icon, onPress }: SecondaryNavButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: '#c7d6fb',
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  pressed: { opacity: 0.7 },
  icon: { fontSize: 16 },
  label: { color: colors.accent, fontWeight: '700', fontSize: 15 },
});
