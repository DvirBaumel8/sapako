import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../../../src/api/branches';
import { fetchDepartments } from '../../../../src/api/departments';
import { createProvider } from '../../../../src/api/providers';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { hasLetter, sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';
import { intersectDepartmentNames } from '../../../../src/utils/departmentIntersection';
import { isValidIsraeliPhone, PHONE_VALIDATION_ERROR } from '../../../../src/utils/phoneValidation';
import { isConflictError } from '../../../../src/api/errors';
import { useAlert } from '../../../../src/ui/AlertProvider';

export default function NewProviderScreen() {
  useRequireAdmin();
  const showAlert = useAlert();
  const queryClient = useQueryClient();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());
  // Guards against a second submit while the first is still in flight: on a
  // slow connection the button looks inert, so it gets tapped again and the
  // record is created twice.
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    if (isSubmitting) return;
    setIsSubmitting(true);
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
      // Refresh the lists this record belongs to before returning to them —
      // otherwise the screen renders its cached copy and the new record
      // appears only after navigating away and back.
      await queryClient.invalidateQueries({ queryKey: ['providers'] });
      await queryClient.invalidateQueries({ queryKey: ['departments-for-branches'] });
      // Which branches have a same-named provider is derived from this list.
      await queryClient.invalidateQueries({ queryKey: ['matching-provider-branches'] });
      router.back();
    } catch (err) {
      setIsSubmitting(false);
      if (isConflictError(err)) {
        setNameError('כבר קיים ספק בשם זה באחד הסניפים שנבחרו. יש לבחור שם אחר.');
      } else {
        showAlert({ title: 'שגיאה', message: 'יצירת הספק נכשלה. יש לנסות שוב.' });
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
            <>
              {/* The old wording said "no department shared by all selected
                  branches" even when only one branch was selected, which reads
                  as a bug rather than as "this branch has no departments yet". */}
              <Text style={styles.errorText}>
                {selectedBranchIds.size === 1
                  ? 'לסניף שנבחר אין עדיין מחלקות. יש להוסיף מחלקה לפני יצירת הספק.'
                  : 'אין מחלקה המשותפת לכל הסניפים שנבחרו. יש להוסיף מחלקה בשם זהה בכל אחד מהם.'}
              </Text>
              <Pressable
                onPress={() => router.push('/departments/new')}
                style={styles.addDepartmentButton}
              >
                <Text style={styles.addDepartmentText}>+ הוספת מחלקה</Text>
              </Pressable>
            </>
          )}
          <View style={styles.chipWrap}>
            {departmentNameOptions.map((departmentName) => (
              <Pressable
                key={departmentName}
                onPress={() => toggleDepartmentName(departmentName)}
                style={[
                  styles.branchChip,
                  selectedDepartmentNames.has(departmentName) && styles.branchChipSelected,
                ]}
              >
                <Text>{departmentName}</Text>
              </Pressable>
            ))}
          </View>
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
          selectedDepartmentNames.size === 0 || isSubmitting}
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
  addDepartmentButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  addDepartmentText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
});
