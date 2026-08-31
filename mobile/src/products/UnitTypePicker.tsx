import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UNIT_TYPES } from './unitTypes';

interface UnitTypePickerProps {
  value: string;
  onChange: (unitType: string) => void;
}

/**
 * Replaces a free-text field. The unit decides whether fractional quantities
 * are allowed, so it cannot be an arbitrary string — and a picker also spares
 * whoever adds a product from typing the same three words repeatedly.
 */
export function UnitTypePicker({ value, onChange }: UnitTypePickerProps) {
  return (
    <View style={styles.row}>
      {UNIT_TYPES.map((unitType) => {
        const isSelected = unitType === value;
        return (
          <Pressable
            key={unitType}
            testID={`unit-option-${unitType}`}
            onPress={() => onChange(unitType)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {unitType}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 15, color: '#1a1a1a' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
});
