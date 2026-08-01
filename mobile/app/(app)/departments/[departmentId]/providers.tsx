import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch } from '../../../../src/api/providers';
import { useBranch } from '../../../../src/branch/BranchContext';

export default function DepartmentProvidersScreen() {
  const { departmentId, departmentName } = useLocalSearchParams<{
    departmentId: string;
    departmentName?: string;
  }>();
  const { selectedBranch } = useBranch();
  const { data: providers, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });

  const departmentProviders = providers?.filter((provider) =>
    provider.departments.some((department) => department.id === departmentId),
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: departmentName ?? '' }} />
      {isLoading && <Text style={styles.statusText}>טוען ספקים…</Text>}
      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={departmentProviders}
        keyExtractor={(provider) => provider.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: '/providers/[providerId]/order',
                params: { providerId: item.id, providerName: item.name },
              })
            }
          >
            <Text style={styles.cardText}>{item.name}</Text>
          </Pressable>
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
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardText: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
});
