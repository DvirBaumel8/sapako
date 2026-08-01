import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch, updateProvider } from '../../../../src/api/providers';
import { fetchDepartments } from '../../../../src/api/departments';
import { useBranch } from '../../../../src/branch/BranchContext';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';

const ISRAELI_MOBILE_PATTERN = /^05\d{8}$/;

export default function EditProviderScreen() {
  useRequireAdmin();
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { selectedBranch } = useBranch();
  const { data: providers } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });
  const { data: departments } = useQuery({
    queryKey: ['departments', selectedBranch!.id],
    queryFn: () => fetchDepartments(selectedBranch!.id),
  });
  const provider = providers?.find((item) => item.id === providerId);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (provider && !isInitialized) {
      setName(provider.name);
      setPhone(provider.phone);
      setIsActive(provider.isActive);
      setSelectedDepartmentIds(new Set(provider.departments.map((department) => department.id)));
      setIsInitialized(true);
    }
  }, [provider, isInitialized]);

  const isPhoneValid = ISRAELI_MOBILE_PATTERN.test(phone);
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
    await updateProvider(providerId, {
      name,
      phone,
      isActive,
      departmentIds: Array.from(selectedDepartmentIds),
    });
    router.back();
  };

  if (!isInitialized) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>טוען…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="שם הספק"
        value={name}
        onChangeText={(text) => setName(sanitizeHebrewInput(text))}
      />
      <TextInput
        style={styles.input}
        placeholder="טלפון וואטסאפ (לדוגמה: 0501234567)"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      {phone.length > 0 && !isPhoneValid && (
        <Text style={styles.errorText}>מספר טלפון לא תקין. הפורמט הנדרש: 05XXXXXXXX</Text>
      )}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>פעיל</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>
      <Text style={styles.label}>מחלקות</Text>
      <FlatList
        horizontal
        style={styles.departmentList}
        data={activeDepartments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggleDepartment(item.id)}
            style={[
              styles.departmentChip,
              selectedDepartmentIds.has(item.id) && styles.departmentChipSelected,
            ]}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />
      <PrimaryButton
        title="שמירה"
        onPress={handleSubmit}
        disabled={!name || !isPhoneValid || selectedDepartmentIds.size === 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 16, fontWeight: '600' },
  label: { fontWeight: '600' },
  departmentList: { flexGrow: 0 },
  departmentChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginRight: 8,
  },
  departmentChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
});
