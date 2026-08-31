import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from './theme';

interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Replaces react-native's Switch.
 *
 * On web that component renders with its own platform styling — a dark circle
 * offset from a pale track — which matches nothing else in the app and reads
 * as broken rather than as a control. This is a plain pill in the app's own
 * colours, which also makes the on state unambiguous at a glance in a long
 * list of them.
 */
export function Toggle({ value, onValueChange, disabled, accessibilityLabel }: ToggleProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[
        styles.track,
        value ? styles.trackOn : styles.trackOff,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

const TRACK_WIDTH = 50;
const TRACK_HEIGHT = 30;
const KNOB_SIZE = 24;
const INSET = (TRACK_HEIGHT - KNOB_SIZE) / 2;

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
  },
  trackOn: { backgroundColor: colors.accent },
  trackOff: { backgroundColor: '#d1d5db' },
  disabled: { opacity: 0.45 },
  knob: {
    position: 'absolute',
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: colors.surface,
  },
  // Positioned in physical terms rather than start/end: the knob should sit
  // on the same side regardless of the RTL layout around it, so that a column
  // of these reads as one consistent control.
  knobOn: { right: INSET },
  knobOff: { left: INSET },
});
