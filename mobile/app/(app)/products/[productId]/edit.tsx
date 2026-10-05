import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteProduct, updateProduct } from '../../../../src/api/products';
import { isConflictError } from '../../../../src/api/errors';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireProductEditor } from '../../../../src/auth/useRequireProductEditor';
import { hasLetter, sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';
import { useAlert } from '../../../../src/ui/AlertProvider';
import { UnitTypePicker } from '../../../../src/products/UnitTypePicker';
import { CategoryPicker } from '../../../../src/products/CategoryPicker';
import { DEFAULT_UNIT_TYPE } from '../../../../src/products/unitTypes';

export default function EditProductScreen() {
  useRequireProductEditor();
  const {
    productId,
    productName,
    unitType: initialUnitType,
    barcode: initialBarcode,
    additionalBarcodes,
    providerId,
    categoryId: initialCategoryId,
  } = useLocalSearchParams<{
    productId: string;
    productName?: string;
    unitType?: string;
    barcode?: string;
    additionalBarcodes?: string;
    providerId: string;
    categoryId?: string;
  }>();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const [name, setName] = useState(productName ?? '');
  const [unitType, setUnitType] = useState<string>(initialUnitType ?? DEFAULT_UNIT_TYPE);
  const [barcode, setBarcode] = useState(initialBarcode ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId || null);
  const isNameValid = hasLetter(name);

  const invalidateProducts = async () => {
    await queryClient.invalidateQueries({ queryKey: ['products', providerId] });
    // The home screen searches a branch-wide product list under its own key.
    // Without this, a renamed or deleted product still appears in search
    // results until the app is fully reloaded.
    await queryClient.invalidateQueries({ queryKey: ['branch-products'] });
  };

  const handleSubmit = async () => {
    try {
      await updateProduct(productId, { name, unitType, barcode: barcode || undefined, categoryId });
      await invalidateProducts();
      router.back();
    } catch (err) {
      showAlert({
        title: 'שגיאה',
        message: isConflictError(err)
          ? 'מוצר בשם הזה כבר קיים אצל הספק.'
          : 'שמירת המוצר נכשלה. יש לנסות שוב.',
      });
    }
  };

  const removeProduct = useMutation({
    mutationFn: () => deleteProduct(productId),
    onSuccess: async () => {
      await invalidateProducts();
      router.back();
    },
    onError: () => {
      showAlert({ title: 'שגיאה', message: 'מחיקת המוצר נכשלה. יש לנסות שוב.' });
    },
  });

  const confirmDelete = () => {
    showAlert({
      title: 'מחיקת מוצר',
      message: `למחוק את "${productName ?? name}"? לא ניתן לשחזר פעולה זו.`,
      buttons: [
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחיקה', style: 'destructive', onPress: () => removeProduct.mutate() },
      ],
    });
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="שם המוצר"
        value={name}
        onChangeText={(text) => setName(sanitizeHebrewInput(text))}
      />
      {name.length > 0 && !isNameValid && (
        <Text style={styles.errorText}>שם המוצר חייב לכלול אותיות, לא רק מספרים.</Text>
      )}
      <UnitTypePicker value={unitType} onChange={setUnitType} />
      <TextInput style={styles.input} placeholder="ברקוד (אופציונלי)" value={barcode} onChangeText={setBarcode} />
      {additionalBarcodes ? (
        <Text style={styles.additionalBarcodes}>
          {`ברקודים נוספים: ${additionalBarcodes.split(',').join(', ')}`}
        </Text>
      ) : null}
      <Text style={styles.label}>קטגוריה</Text>
      <CategoryPicker providerId={providerId} value={categoryId} onChange={setCategoryId} />
      <PrimaryButton title="שמירה" onPress={handleSubmit} disabled={!name || !isNameValid || !unitType} />
      <Pressable style={styles.deleteButton} onPress={confirmDelete} disabled={removeProduct.isPending}>
        <Text style={styles.deleteButtonText}>מחיקת מוצר</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  additionalBarcodes: { fontSize: 13, color: '#666', textAlign: 'right' },
  container: { flex: 1, padding: 16, gap: 12 },
  label: { fontWeight: '600', textAlign: 'right' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
  deleteButton: { paddingVertical: 12, alignItems: 'center' },
  deleteButtonText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
