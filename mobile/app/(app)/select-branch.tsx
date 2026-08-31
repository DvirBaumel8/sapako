import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../src/api/branches';
import { useBranch } from '../../src/branch/BranchContext';
import { useAuth } from '../../src/auth/AuthContext';

export default function SelectBranchScreen() {
  const { selectBranch } = useBranch();
  const { role } = useAuth();
  const { data: branches, isLoading, error } = useQuery({
    queryKey: ['branches'],
    queryFn: fetchAccessibleBranches,
  });

  // With a single branch there is no choice to make, so presenting one is
  // just a tap on every launch. Selecting it automatically is what the user
  // would have done anyway.
  useEffect(() => {
    if (branches?.length === 1) {
      selectBranch(branches[0]);
      router.replace('/');
    }
  }, [branches, selectBranch]);

  if (isLoading || branches?.length === 1) {
    return (
      <View style={styles.centered}>
        <Text>טוען סניפים…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centered}>
        <Text>לא ניתן לטעון סניפים. יש למשוך לרענון.</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={branches}
      keyExtractor={(branch) => branch.id}
      ListHeaderComponent={
        role === 'ADMIN' ? (
          <Pressable onPress={() => router.push('/admin')} style={styles.adminButton}>
            <Text style={styles.adminButtonText}>ניהול</Text>
          </Pressable>
        ) : null
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.item}
          onPress={() => {
            selectBranch(item);
            router.replace('/');
          }}
        >
          <Text style={styles.itemText}>{item.name}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 8 },
  adminButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  adminButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  item: { padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
  itemText: { fontSize: 16, fontWeight: '600' },
});
