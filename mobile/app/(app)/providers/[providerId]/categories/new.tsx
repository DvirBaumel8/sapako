import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { createCategory } from '../../../../../src/api/categories';
import { PrimaryButton } from '../../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../../src/auth/useRequireAdmin';
import { hasLetter, sanitizeHebrewInput } from '../../../../../src/utils/hebrewInput';
import { isConflictError } from '../../../../../src/api/errors';
import { useAlert } from '../../../../../src/ui/AlertProvider';

export default function NewCategoryScreen() {
  useRequireAdmin();
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const showAlert = useAlert();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const isNameValid = hasLetter(name);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setNameError('');
    try {
      await createCategory(providerId, { name });
      await queryClient.invalidateQueries({ queryKey: ['categories', providerId] });
      router.back();
    } catch (err) {
      setIsSubmitting(false);
      if (isConflictError(err)) {
        setNameError('כבר קיימת קטגוריה בשם זה אצל ספק זה. יש לבחור שם אחר.');
      } else {
        showAlert({ title: 'שגיאה', message: 'יצירת הקטגוריה נכשלה. יש לנסות שוב.' });
      }
    }
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
      <PrimaryButton
        title="יצירת קטגוריה"
        onPress={handleSubmit}
        disabled={!name || !isNameValid || isSubmitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: '#f5f5f5' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
});
