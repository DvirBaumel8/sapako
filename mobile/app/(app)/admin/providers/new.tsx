import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../../../src/api/branches';
import { fetchDepartments } from '../../../../src/api/departments';
import { createProvider } from '../../../../src/api/providers';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { hasLetter, sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';
import { intersectDepartmentNames } from '../../../../src/utils/departmentIntersection';
import { isValidIsraeliPhone, PHONE_VALIDATION_ERROR } from '../../../../src/utils/phoneValidation';
import { isConflictError } from '../../../../src/api/errors';

export default function NewProviderScreen() {
  useRequireAdmin();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedDepartmentNames, setSelectedDepartmentNames] = useState<Set<string>>(new Set());
  const [nameError, setNameError] = useState('');

  const branchIdsList = Array.from(selectedBranchIds);
  const { data: departmentsByBranch } = useQuery({
    queryKey: ['departments-for-branches', branchIdsList.slice().sort().join(',')],
    queryFn: () =>
      Promise.all(
        branchIdsList.map(async (branchId) => ({
          branchId,
          departments: await fetchDepartments(branchId),
        })),
      ),
    enabled: branchIdsList.length > 0,
  });

  const departmentNameOptions = useMemo(
    () => intersectDepartmentNames((departmentsByBranch ?? []).map((entry) => entry.departments)),
    [departmentsByBranch],
  );

  const isPhoneValid = isValidIsraeliPhone(phone);
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
    setSelectedDepartmentNames(new Set());
  };

  const toggleDepartmentName = (name: string) => {
    setSelectedDepartmentNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!departmentsByBranch) return;
    setNameError('');
    try {
      await Promise.all(
        departmentsByBranch.map(({ branchId, departments }) => {
          const departmentIds = departments
            .filter((department) => selectedDepartmentNames.has(department.name))
            .map((department) => department.id);
          return createProvider(branchId, { name, phone, departmentIds });
        }),
      );
      router.back();
    } catch (err) {
      if (isConflictError(err)) {
        setNameError('כבר קיים ספק בשם זה באחד הסניפים שנבחרו. יש לבחור שם אחר.');
      } else {
        Alert.alert('שגיאה', 'יצירת הספק נכשלה. יש לנסות שוב.');
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
        placeholder="שם הספק"
        value={name}
        onChangeText={(text) => {
          setName(sanitizeHebrewInput(text));
          setNameError('');
        }}
      />
      {name.length > 0 && !isNameValid && (
        <Text style={styles.errorText}>שם הספק חייב לכלול אותיות, לא רק מספרים.</Text>
      )}
      {nameError.length > 0 && <Text style={styles.errorText}>{nameError}</Text>}
      <TextInput
        style={styles.input}
        placeholder="טלפון וואטסאפ (לדוגמה: 0501234567)"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      {phone.length > 0 && !isPhoneValid && (
        <Text style={styles.errorText}>{PHONE_VALIDATION_ERROR}</Text>
      )}
      {selectedBranchIds.size > 0 && (
        <>
          <Text style={styles.label}>מחלקות</Text>
          {departmentsByBranch && departmentNameOptions.length === 0 && (
            <Text style={styles.errorText}>
              אין מחלקה משותפת לכל הסניפים שנבחרו. יש להוסיף מחלקה תואמת לפני יצירת הספק.
            </Text>
          )}
          <FlatList
            horizontal
            style={styles.branchList}
            data={departmentNameOptions}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => toggleDepartmentName(item)}
                style={[
                  styles.branchChip,
                  selectedDepartmentNames.has(item) && styles.branchChipSelected,
                ]}
              >
                <Text>{item}</Text>
              </Pressable>
            )}
          />
        </>
      )}
      <PrimaryButton
        title="יצירת ספק"
        onPress={handleSubmit}
        disabled={
          selectedBranchIds.size === 0 ||
          !name ||
          !isNameValid ||
          !isPhoneValid ||
          !departmentsByBranch ||
          selectedDepartmentNames.size === 0
        }
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
