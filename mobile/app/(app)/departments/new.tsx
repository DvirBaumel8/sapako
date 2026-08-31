import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const { selectedBranch } = useBranch();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(
    new Set(selectedBranch ? [selectedBranch.id] : []),
  );
  // Guards against a second submit while the first is still in flight: on a
  // slow connection the button looks inert, so it gets tapped again and the
  // record is created twice.
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    if (isSubmitting) return;
    setIsSubmitting(true);
    setNameError('');
    try {
      await Promise.all(
        Array.from(selectedBranchIds).map((branchId) => createDepartment(branchId, { name })),
      );
      // Refresh the lists this record belongs to before returning to them —
      // otherwise the screen renders its cached copy and the new record
      // appears only after navigating away and back.
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      router.back();
    } catch (err) {
      setIsSubmitting(false);
      if (isConflictError(err)) {
        setNameError('כבר קיימת מחלקה בשם זה באחד הסניפים שנבחרו. יש לבחור שם אחר.');
      } else {
        showAlert({ title: 'שגיאה', message: 'יצירת המחלקה נכשלה. יש לנסות שוב.' });
      }
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>סניפים</Text>
      {/* Wrapped, not a horizontal scroller: the row hid options off the
          screen edge while the space below sat empty. */}
      <View style={styles.chipWrap}>
        {branches?.map((branch) => (
          <Pressable
            key={branch.id}
            onPress={() => toggleBranch(branch.id)}
            style={[styles.branchChip, selectedBranchIds.has(branch.id) && styles.branchChipSelected]}
          >
            <Text>{branch.name}</Text>
          </Pressable>
        ))}
      </View>
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
        disabled={selectedBranchIds.size === 0 || !name || !isNameValid || isSubmitting}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  container: { flexGrow: 1, padding: 16, gap: 12 },
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
