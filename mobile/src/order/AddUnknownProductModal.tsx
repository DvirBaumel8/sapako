import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createProduct } from '../api/products';
import { PrimaryButton } from '../components/PrimaryButton';
import { hasLetter, sanitizeHebrewInput } from '../utils/hebrewInput';
import { useAlert } from '../ui/AlertProvider';
import type { Product } from '../api/types';
import { UnitTypePicker } from '../products/UnitTypePicker';
import { DEFAULT_UNIT_TYPE } from '../products/unitTypes';

interface AddUnknownProductModalProps {
  visible: boolean;
  providerId: string;
  barcode: string;
  onClose: () => void;
  onCreated: (product: Product) => void;
}

// Shown when a scanned barcode doesn't match any product this provider
// already has — lets an admin add it on the spot instead of hitting a dead
// end mid-order. Deliberately minimal (just name + unit) compared to the
// full admin "add product" flow, which also handles creating the same
// product across multiple branches at once — not relevant here since the
// provider is already known.
export function AddUnknownProductModal({
  visible,
  providerId,
  barcode,
  onClose,
  onCreated,
}: AddUnknownProductModalProps) {
  const showAlert = useAlert();
  const [name, setName] = useState('');
  const [unitType, setUnitType] = useState<string>(DEFAULT_UNIT_TYPE);
  const [isSaving, setIsSaving] = useState(false);
  const isNameValid = hasLetter(name);
  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setUnitType('');
    }
  }, [visible]);

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      const product = await createProduct(providerId, { name, unitType, barcode });
      onCreated(product);
    } catch {
      showAlert({ title: 'שגיאה', message: 'הוספת המוצר נכשלה. יש לנסות שוב.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // autoFocus is unreliable here: on Android, a Modal's native window
      // often isn't fully attached at mount time, so autoFocus can leave the
      // input in a phantom-focused state (RN thinks it's focused, cursor
      // blinks) without ever raising the real keyboard — and it doesn't
      // recover on a later tap either. onShow fires once the window is
      // truly up, which is the reliable time to request focus.
      onShow={() => nameInputRef.current?.focus()}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>מוצר לא נמצא — הוספת מוצר חדש</Text>
          <Text style={styles.barcodeText}>ברקוד: {barcode}</Text>
          <TextInput
            ref={nameInputRef}
            style={styles.input}
            placeholder="שם המוצר"
            value={name}
            onChangeText={(text) => setName(sanitizeHebrewInput(text))}
          />
          {name.length > 0 && !isNameValid && (
            <Text style={styles.errorText}>שם המוצר חייב לכלול אותיות, לא רק מספרים.</Text>
          )}
          <UnitTypePicker value={unitType} onChange={setUnitType} />
          <PrimaryButton
            title="הוספה והוספה להזמנה"
            onPress={handleSubmit}
            disabled={!name || !isNameValid || !unitType}
            loading={isSaving}
          />
          <Pressable style={styles.cancelButton} onPress={onClose} disabled={isSaving}>
            <Text style={styles.cancelButtonText}>ביטול</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'right', color: '#1a1a1a' },
  barcodeText: { fontSize: 13, color: '#666', textAlign: 'right' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, textAlign: 'right' },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
  cancelButton: { paddingVertical: 8, alignItems: 'center' },
  cancelButtonText: { color: '#666', fontSize: 14 },
});
