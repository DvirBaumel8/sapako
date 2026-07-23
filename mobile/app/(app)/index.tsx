import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch } from '../../src/api/providers';
import { useBranch } from '../../src/branch/BranchContext';

export default function HomeScreen() {
  const { selectedBranch } = useBranch();
  const { data: providers, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.push('/select-branch')}>
        <Text style={styles.branchName}>{selectedBranch!.name} ▾</Text>
      </Pressable>
      <Link href="/activity" style={styles.activityLink}>פעילות אחרונה</Link>

      {isLoading && <Text>טוען ספקים…</Text>}
      {error && <Text>לא ניתן לטעון ספקים. יש למשוך לרענון.</Text>}

      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={providers}
        keyExtractor={(provider) => provider.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.item}
            onPress={() => router.push(`/providers/${item.id}/order`)}
          >
            <Text style={styles.itemText}>{item.name}</Text>
          </Pressable>
        )}
        ListEmptyComponent={!isLoading ? <Text>אין עדיין ספקים לסניף זה.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  branchName: { fontSize: 20, fontWeight: '700' },
  activityLink: { color: '#2563eb', marginBottom: 8 },
  item: { padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 8 },
  itemText: { fontSize: 16, fontWeight: '600' },
});
