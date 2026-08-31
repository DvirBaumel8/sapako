import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteDepartment, updateDepartment } from '../../../../src/api/departments';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { useBranch } from '../../../../src/branch/BranchContext';
import { hasLetter, sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';
import { isConflictError } from '../../../../src/api/errors';
import { useAlert } from '../../../../src/ui/AlertProvider';

export default function EditDepartmentScreen() {
  useRequireAdmin();
  const { departmentId, departmentName } = useLocalSearchParams<{
    departmentId: string;
    departmentName?: string;
  }>();
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const [name, setName] = useState(departmentName ?? '');
  const [nameError, setNameError] = useState('');
  const isNameValid = hasLetter(name);

  const invalidateDepartments = () =>
    queryClient.invalidateQueries({ queryKey: ['departments', selectedBranch!.id] });

  const handleSubmit = async () => {
    setNameError('');
    try {
      await updateDepartment(departmentId, { name });
      await invalidateDepartments();
      router.back();
    } catch (err) {
      if (isConflictError(err)) {
        setNameError('כבר קיימת מחלקה בשם זה בסניף. יש לבחור שם אחר.');
      } else {
        showAlert({ title: 'שגיאה', message: 'שמירת המחלקה נכשלה. יש לנסות שוב.' });
      }
    }
  };

  const removeDepartment = useMutation({
    mutationFn: () => deleteDepartment(departmentId),
    onSuccess: async () => {
      await invalidateDepartments();
      router.back();
    },
    onError: () => {
      showAlert({ title: 'שגיאה', message: 'מחיקת המחלקה נכשלה. יש לנסות שוב.' });
    },
  });

  const confirmDelete = () => {
    showAlert({
      title: 'מחיקת מחלקה',
      message: `למחוק את המחלקה "${departmentName ?? name}"? הספקים המשויכים אליה לא יימחקו, רק השיוך למחלקה זו יוסר. לא ניתן לשחזר פעולה זו.`,
      buttons: [
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחיקה', style: 'destructive', onPress: () => removeDepartment.mutate() },
      ],
    });
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="שם המחלקה"
        value={name}
        onChangeText={(text) => {
          setName(sanitizeHebrewInput(text));
          setNameError('');
        }}
      />
      {name.length > 0 && !isNameValid && (
        <Text style={styles.errorText}>שם המחלקה חייב לכלול אותיות, לא רק מספרים.</Text>
      )}
      {nameError.length > 0 && <Text style={styles.errorText}>{nameError}</Text>}
      <PrimaryButton title="שמירה" onPress={handleSubmit} disabled={!name || !isNameValid} />
      <Pressable
        style={styles.deleteButton}
        onPress={confirmDelete}
        disabled={removeDepartment.isPending}
      >
        <Text style={styles.deleteButtonText}>מחיקת מחלקה</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
  deleteButton: { paddingVertical: 12, alignItems: 'center' },
  deleteButtonText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
