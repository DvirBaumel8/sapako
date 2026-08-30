import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../../src/api/branches';
import { createDepartment } from '../../../src/api/departments';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../src/auth/useRequireAdmin';
import { useBranch } from '../../../src/branch/BranchContext';
import { hasLetter, sanitizeHebrewInput } from '../../../src/utils/hebrewInput';
import { isConflictError } from '../../../src/api/errors';
import { useAlert } from '../../../src/ui/AlertProvider';

export default function NewDepartmentScreen() {
  useRequireAdmin();
  const showAlert = useAlert();
  const { selectedBranch } = useBranch();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(
    new Set(selectedBranch ? [selectedBranch.id] : []),
  );
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const isNameValid = hasLetter(name);

  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) {
        next.delete(branchId);
      } else {
        next.add(branchId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setNameError('');
    try {
      await Promise.all(
        Array.from(selectedBranchIds).map((branchId) => createDepartment(branchId, { name })),
      );
      router.back();
    } catch (err) {
      if (isConflictError(err)) {
        setNameError('כבר קיימת מחלקה בשם זה באחד הסניפים שנבחרו. יש לבחור שם אחר.');
      } else {
        showAlert({ title: 'שגיאה', message: 'יצירת המחלקה נכשלה. יש לנסות שוב.' });
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>סניפים</Text>
      <FlatList
        horizontal
        style={styles.branchList}
        data={branches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggleBranch(item.id)}
            style={[styles.branchChip, selectedBranchIds.has(item.id) && styles.branchChipSelected]}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />
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
      <PrimaryButton
        title="יצירת מחלקה"
        onPress={handleSubmit}
        disabled={selectedBranchIds.size === 0 || !name || !isNameValid}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  label: { fontWeight: '600' },
  branchList: { flexGrow: 0 },
  branchChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginRight: 8,
  },
  branchChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
});
