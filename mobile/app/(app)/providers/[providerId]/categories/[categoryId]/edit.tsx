import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCategory, updateCategory } from '../../../../../../src/api/categories';
import { PrimaryButton } from '../../../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../../../src/auth/useRequireAdmin';
import { hasLetter, sanitizeHebrewInput } from '../../../../../../src/utils/hebrewInput';
import { isConflictError } from '../../../../../../src/api/errors';
import { useAlert } from '../../../../../../src/ui/AlertProvider';

export default function EditCategoryScreen() {
  useRequireAdmin();
  const { providerId, categoryId, categoryName } = useLocalSearchParams<{
    providerId: string;
    categoryId: string;
    categoryName?: string;
  }>();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const [name, setName] = useState(categoryName ?? '');
  const [nameError, setNameError] = useState('');
  const isNameValid = hasLetter(name);

  const invalidateCategories = () =>
    queryClient.invalidateQueries({ queryKey: ['categories', providerId] });

  const handleSubmit = async () => {
    setNameError('');
    try {
      await updateCategory(categoryId, { name });
      await invalidateCategories();
      router.back();
    } catch (err) {
      if (isConflictError(err)) {
        setNameError('כבר קיימת קטגוריה בשם זה אצל ספק זה. יש לבחור שם אחר.');
      } else {
        showAlert({ title: 'שגיאה', message: 'שמירת הקטגוריה נכשלה. יש לנסות שוב.' });
      }
    }
  };

  const removeCategory = useMutation({
    mutationFn: () => deleteCategory(categoryId),
    onSuccess: async () => {
      await invalidateCategories();
      // Products in a deleted category fall back to uncategorized, so the
      // provider's own product list is stale too, same as when unlinking a
      // department elsewhere.
      await queryClient.invalidateQueries({ queryKey: ['products', providerId] });
      router.back();
    },
    onError: () => {
      showAlert({ title: 'שגיאה', message: 'מחיקת הקטגוריה נכשלה. יש לנסות שוב.' });
    },
  });

  const confirmDelete = () => {
    showAlert({
      title: 'מחיקת קטגוריה',
      message: `למחוק את הקטגוריה "${categoryName ?? name}"? המוצרים בה לא יימחקו, הם רק יעברו למצב "ללא קטגוריה". לא ניתן לשחזר פעולה זו.`,
      buttons: [
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחיקה', style: 'destructive', onPress: () => removeCategory.mutate() },
      ],
    });
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="שם הקטגוריה"
        value={name}
        onChangeText={(text) => {
          setName(sanitizeHebrewInput(text));
          setNameError('');
        }}
      />
      {name.length > 0 && !isNameValid && (
        <Text style={styles.errorText}>שם הקטגוריה חייב לכלול אותיות, לא רק מספרים.</Text>
      )}
      {nameError.length > 0 && <Text style={styles.errorText}>{nameError}</Text>}
      <PrimaryButton title="שמירה" onPress={handleSubmit} disabled={!name || !isNameValid} />
      <Pressable
        style={styles.deleteButton}
        onPress={confirmDelete}
        disabled={removeCategory.isPending}
      >
        <Text style={styles.deleteButtonText}>מחיקת קטגוריה</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: '#f5f5f5' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
  deleteButton: { paddingVertical: 12, alignItems: 'center' },
  deleteButtonText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
