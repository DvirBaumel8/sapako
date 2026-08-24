import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllProvidersForBranch, fetchProvidersForBranch, updateProvider } from '../../../../src/api/providers';
import { useBranch } from '../../../../src/branch/BranchContext';
import { useAuth } from '../../../../src/auth/AuthContext';
import type { Provider } from '../../../../src/api/types';

export default function DepartmentProvidersScreen() {
  const { departmentId, departmentName } = useLocalSearchParams<{
    departmentId: string;
    departmentName?: string;
  }>();
  const { selectedBranch } = useBranch();
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const queryClient = useQueryClient();
  const { data: providers, isLoading, refetch, isRefetching } = useQuery({
    queryKey: isAdmin
      ? ['providers', selectedBranch!.id, 'all']
      : ['providers', selectedBranch!.id],
    queryFn: () =>
      isAdmin
        ? fetchAllProvidersForBranch(selectedBranch!.id)
        : fetchProvidersForBranch(selectedBranch!.id),
  });

  const departmentProviders = providers?.filter((provider) =>
    provider.departments.some((department) => department.id === departmentId),
  );

  const removeFromDepartment = useMutation({
    mutationFn: (provider: Provider) =>
      updateProvider(provider.id, {
        departmentIds: provider.departments
          .filter((department) => department.id !== departmentId)
          .map((department) => department.id),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers', selectedBranch!.id] });
    },
    onError: () => {
      Alert.alert('שגיאה', 'הסרת הספק מהמחלקה נכשלה. יש לנסות שוב.');
    },
  });

  const confirmRemove = (provider: Provider) => {
    Alert.alert(
      'הסרת ספק מהמחלקה',
      `להסיר את "${provider.name}" מהמחלקה "${departmentName ?? ''}"? הספק עצמו לא יימחק.`,
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'הסרה', style: 'destructive', onPress: () => removeFromDepartment.mutate(provider) },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: departmentName ?? '' }} />
      {isAdmin && (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/departments/[departmentId]/add-provider',
              params: { departmentId, departmentName },
            })
          }
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>+ הוספת ספק</Text>
        </Pressable>
      )}
      {isLoading && <Text style={styles.statusText}>טוען ספקים…</Text>}
      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={departmentProviders}
        keyExtractor={(provider) => provider.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.isActive && styles.cardInactive]}>
            <Pressable
              style={styles.cardMain}
              onPress={() =>
                router.push({
                  pathname: '/providers/[providerId]/order',
                  params: { providerId: item.id, providerName: item.name },
                })
              }
            >
              <Text style={styles.cardText}>{item.name}</Text>
              {!item.isActive && <Text style={styles.inactiveLabel}>לא פעיל</Text>}
            </Pressable>
            {isAdmin && (
              <Pressable hitSlop={8} style={styles.removeButton} onPress={() => confirmRemove(item)}>
                <Text style={styles.removeButtonText}>✕</Text>
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.statusText}>אין ספקים במחלקה זו.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 16 },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  addButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardMain: { flex: 1, padding: 16 },
  cardText: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
  cardInactive: { opacity: 0.5 },
  inactiveLabel: { fontSize: 12, color: '#c0392b', textAlign: 'right', marginTop: 2 },
  removeButton: { paddingHorizontal: 16 },
  removeButtonText: { fontSize: 16, color: '#c0392b', fontWeight: '700' },
});
