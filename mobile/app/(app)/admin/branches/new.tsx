import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { createBranch } from '../../../../src/api/branches';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { hasLetter, sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';
import { isConflictError } from '../../../../src/api/errors';
import { useAlert } from '../../../../src/ui/AlertProvider';

export default function NewBranchScreen() {
  useRequireAdmin();
  const showAlert = useAlert();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const isNameValid = hasLetter(name);

  const handleSubmit = async () => {
    setNameError('');
    try {
      await createBranch({ name });
      // Refresh the list this row belongs to before returning to it —
      // otherwise the screen renders its cached copy and the new record
      // appears only after navigating away and back.
      await queryClient.invalidateQueries({ queryKey: ['branches'] });
      router.back();
    } catch (err) {
      if (isConflictError(err)) {
        setNameError('כבר קיים סניף בשם זה. יש לבחור שם אחר.');
      } else {
        showAlert({ title: 'שגיאה', message: 'יצירת הסניף נכשלה. יש לנסות שוב.' });
      }
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="שם הסניף"
        value={name}
        onChangeText={(text) => {
          setName(sanitizeHebrewInput(text));
          setNameError('');
        }}
      />
      {name.length > 0 && !isNameValid && (
        <Text style={styles.errorText}>שם הסניף חייב לכלול אותיות, לא רק מספרים.</Text>
      )}
      {nameError.length > 0 && <Text style={styles.errorText}>{nameError}</Text>}
      <PrimaryButton title="יצירת סניף" onPress={handleSubmit} disabled={!name || !isNameValid} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
});
