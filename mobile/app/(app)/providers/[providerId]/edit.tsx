import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteProvider, fetchAllProvidersForBranch, updateProvider } from '../../../../src/api/providers';
import { fetchDepartments } from '../../../../src/api/departments';
import { useBranch } from '../../../../src/branch/BranchContext';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { hasLetter, sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';
import { isValidIsraeliPhone, PHONE_VALIDATION_ERROR } from '../../../../src/utils/phoneValidation';
import { isConflictError } from '../../../../src/api/errors';
import { useAlert } from '../../../../src/ui/AlertProvider';

export default function EditProviderScreen() {
  useRequireAdmin();
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const { data: providers } = useQuery({
    queryKey: ['providers', selectedBranch!.id, 'all'],
    queryFn: () => fetchAllProvidersForBranch(selectedBranch!.id),
  });
  const { data: departments } = useQuery({
    queryKey: ['departments', selectedBranch!.id],
    queryFn: () => fetchDepartments(selectedBranch!.id),
  });
  const provider = providers?.find((item) => item.id === providerId);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (provider && !isInitialized) {
      setName(provider.name);
      setPhone(provider.phone);
      setSelectedDepartmentIds(new Set(provider.departments.map((department) => department.id)));
      setIsInitialized(true);
    }
  }, [provider, isInitialized]);

  const isPhoneValid = isValidIsraeliPhone(phone);
  const isNameValid = hasLetter(name);
  const activeDepartments = departments?.filter((department) => department.isActive);

  const toggleDepartment = (departmentId: string) => {
    setSelectedDepartmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(departmentId)) {
        next.delete(departmentId);
      } else {
        next.add(departmentId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setNameError('');
    try {
      await updateProvider(providerId, {
        name,
        phone,
        departmentIds: Array.from(selectedDepartmentIds),
      });
      // Without this, react-query keeps serving the pre-edit cached provider
      // list, so re-opening this screen right after saving shows the old
      // department selection instead of what was just saved.
      await queryClient.invalidateQueries({ queryKey: ['providers', selectedBranch!.id] });
      await queryClient.invalidateQueries({ queryKey: ['branch-products'] });
      router.back();
    } catch (err) {
      if (isConflictError(err)) {
        setNameError('כבר קיים ספק בשם זה בסניף. יש לבחור שם אחר.');
      } else {
        showAlert({ title: 'שגיאה', message: 'שמירת הספק נכשלה. יש לנסות שוב.' });
      }
    }
  };

  const removeProvider = useMutation({
    mutationFn: () => deleteProvider(providerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['providers', selectedBranch!.id] });
      // Deleting a provider deletes its products, which the home screen's
      // search reads from a separate branch-wide list.
      await queryClient.invalidateQueries({ queryKey: ['branch-products'] });
      router.back();
    },
    onError: () => {
      showAlert({ title: 'שגיאה', message: 'מחיקת הספק נכשלה. יש לנסות שוב.' });
    },
  });

  const confirmDelete = () => {
    showAlert({
      title: 'מחיקת ספק',
      message: `למחוק לצמיתות את "${provider?.name}"? פעולה זו תמחק גם את כל המוצרים וההיסטוריה של ההזמנות שלו. לא ניתן לשחזר פעולה זו.`,
      buttons: [
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחיקה לצמיתות', style: 'destructive', onPress: () => removeProvider.mutate() },
      ],
    });
  };

  if (!isInitialized) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>טוען…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
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
      <Text style={styles.label}>מחלקות</Text>
      {/* Wrapped rather than a horizontal list: a scrolling row silently hid
          departments off the left edge with nothing to indicate more existed. */}
      <View style={styles.departmentWrap}>
        {activeDepartments?.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => toggleDepartment(item.id)}
            style={[
              styles.departmentChip,
              selectedDepartmentIds.has(item.id) && styles.departmentChipSelected,
            ]}
          >
            <Text>{item.name}</Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton
        title="שמירה"
        onPress={handleSubmit}
        disabled={!name || !isNameValid || !isPhoneValid || selectedDepartmentIds.size === 0}
      />
      <Pressable style={styles.deleteButton} onPress={confirmDelete} disabled={removeProvider.isPending}>
        <Text style={styles.deleteButtonText}>מחיקת ספק לצמיתות</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5' },
  // flexGrow, not flex: as a ScrollView's contentContainerStyle, flex: 1
  // pins the content to the viewport height and nothing ever scrolls — which
  // is the bug this ScrollView was added to fix.
  container: { flexGrow: 1, padding: 16, gap: 12 },
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
  label: { fontWeight: '600' },
  departmentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  departmentChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginRight: 8,
  },
  departmentChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  deleteButton: { paddingVertical: 12, alignItems: 'center' },
  deleteButtonText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
