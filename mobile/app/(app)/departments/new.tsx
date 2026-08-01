import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../../src/api/branches';
import { createDepartment } from '../../../src/api/departments';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../src/auth/useRequireAdmin';
import { useBranch } from '../../../src/branch/BranchContext';
import { sanitizeHebrewInput } from '../../../src/utils/hebrewInput';

export default function NewDepartmentScreen() {
  useRequireAdmin();
  const { selectedBranch } = useBranch();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(
    new Set(selectedBranch ? [selectedBranch.id] : []),
  );
  const [name, setName] = useState('');

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
    await Promise.all(
      Array.from(selectedBranchIds).map((branchId) => createDepartment(branchId, { name })),
    );
    router.back();
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
        onChangeText={(text) => setName(sanitizeHebrewInput(text))}
      />
      <PrimaryButton
        title="יצירת מחלקה"
        onPress={handleSubmit}
        disabled={selectedBranchIds.size === 0 || !name}
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
});
