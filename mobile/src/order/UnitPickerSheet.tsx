import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { UnitTypePicker } from '../products/UnitTypePicker';
import { colors, radius, spacing } from '../ui/theme';

interface UnitPickerSheetProps {
  visible: boolean;
  productName: string;
  value: string;
  onChange: (unitType: string) => void;
  onClose: () => void;
}

/**
 * Changes the unit for one line of the order.
 *
 * A sheet rather than a control that cycles on tap: the badge sits next to
 * the +/− stepper on a screen used at speed, so a tap that changed the value
 * outright would make a mis-tap silently alter the order. Opening something
 * dismissable means an accidental tap costs nothing.
 *
 * The change applies to this order only — the product keeps its catalogue
 * unit, which is stated on the sheet so the distinction is not a surprise.
 */
export function UnitPickerSheet({
  visible,
  productName,
  value,
  onChange,
  onClose,
}: UnitPickerSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="סגירה">
        {/* Stops a tap inside the sheet from reaching the backdrop and closing it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>יחידת מידה</Text>
          <Text style={styles.subtitle}>{productName}</Text>
          <View style={styles.picker}>
            <UnitTypePicker
              value={value}
              onChange={(unitType) => {
                onChange(unitType);
                onClose();
              }}
            />
          </View>
          <Text style={styles.note}>השינוי חל על הזמנה זו בלבד</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'right' },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'right' },
  picker: { marginTop: spacing.sm, alignItems: 'flex-start' },
  note: { fontSize: 12, color: colors.textMuted, textAlign: 'right', marginTop: spacing.xs },
});
