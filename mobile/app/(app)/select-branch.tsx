import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../src/api/branches';
import { useBranch } from '../../src/branch/BranchContext';

export default function SelectBranchScreen() {
  const { selectBranch } = useBranch();
  const { data: branches, isLoading, error } = useQuery({
    queryKey: ['branches'],
    queryFn: fetchAccessibleBranches,
  });

  if (isLoading) {
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
  item: { padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
  itemText: { fontSize: 16, fontWeight: '600' },
});
