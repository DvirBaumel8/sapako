import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllProvidersForBranch, updateProvider } from '../../../../src/api/providers';
import { useBranch } from '../../../../src/branch/BranchContext';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { fuzzySearch } from '../../../../src/utils/fuzzySearch';
import { useAlert } from '../../../../src/ui/AlertProvider';

export default function AddProviderToDepartmentScreen() {
  useRequireAdmin();
  const { departmentId, departmentName } = useLocalSearchParams<{
    departmentId: string;
    departmentName?: string;
  }>();
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const [search, setSearch] = useState('');

  const { data: providers, isLoading } = useQuery({
    queryKey: ['providers', selectedBranch!.id, 'all'],
    queryFn: () => fetchAllProvidersForBranch(selectedBranch!.id),
  });

  const eligibleProviders = useMemo(() => {
    const notInDepartment = (providers ?? []).filter(
      (provider) => !provider.departments.some((department) => department.id === departmentId),
    );
    return fuzzySearch(notInDepartment, search, (provider) => provider.name);
  }, [providers, departmentId, search]);

  const addToDepartment = useMutation({
    mutationFn: (provider: NonNullable<typeof providers>[number]) =>
      updateProvider(provider.id, {
        departmentIds: [...provider.departments.map((department) => department.id), departmentId],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers', selectedBranch!.id] });
    },
    onError: () => {
      showAlert({ title: 'שגיאה', message: 'הוספת הספק למחלקה נכשלה. יש לנסות שוב.' });
    },
  });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `הוספת ספק ל${departmentName ?? ''}` }} />
      <TextInput
        style={styles.search}
        placeholder="חפש ספק…"
        value={search}
        onChangeText={setSearch}
      />
      {isLoading && <Text style={styles.statusText}>טוען ספקים…</Text>}
      <FlatList
        data={eligibleProviders}
        keyExtractor={(provider) => provider.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, !item.isActive && styles.cardInactive]}
            disabled={addToDepartment.isPending}
            onPress={() => addToDepartment.mutate(item)}
          >
            <Text style={styles.cardText}>{item.name}</Text>
            <Text style={styles.addLabel}>+ הוספה</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.statusText}>
              {search.trim() ? 'לא נמצאו ספקים תואמים.' : 'כל הספקים כבר משויכים למחלקה זו.'}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 16 },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'right',
    fontSize: 15,
  },
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardInactive: { opacity: 0.5 },
  cardText: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
  addLabel: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
});
