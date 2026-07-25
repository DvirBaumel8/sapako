import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchOrdersForBranch } from '../../src/api/orders';
import { useBranch } from '../../src/branch/BranchContext';

export default function ActivityScreen() {
  const { selectedBranch } = useBranch();
  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders', selectedBranch!.id],
    queryFn: () => fetchOrdersForBranch(selectedBranch!.id),
  });

  // Orders can be edited from this screen (resume/continue), so the cached
  // list would otherwise look stale after coming back from an edit.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // Empty drafts shouldn't be created going forward (order.tsx creates them
  // lazily now), but this also hides any that already exist from before.
  const visibleOrders = useMemo(() => orders?.filter((order) => order.items.length > 0), [orders]);

  return (
    <FlatList
      contentContainerStyle={styles.list}
      refreshing={isRefetching}
      onRefresh={refetch}
      data={visibleOrders}
      keyExtractor={(order) => order.id}
      renderItem={({ item: order }) => (
        <Pressable
          style={styles.row}
          onPress={() =>
            router.push({
              pathname: '/providers/[providerId]/order',
              params: {
                providerId: order.providerId,
                providerName: order.provider.name,
                // DRAFT: resume this exact order. PUBLISHED: start a new draft
                // pre-filled with these items (order.tsx decides which based on status).
                sourceOrder: JSON.stringify(order),
              },
            })
          }
        >
          <Text style={styles.providerName}>{order.provider.name}</Text>
          <Text style={styles.itemCount}>{order.items.length} פריטים</Text>
          <Text style={order.status === 'PUBLISHED' ? styles.sentBadge : styles.draftBadge}>
            {order.status === 'PUBLISHED' ? 'נשלחה' : 'טיוטה'}
          </Text>
          <Text style={styles.chevron}>‹</Text>
        </Pressable>
      )}
      ListEmptyComponent={!isLoading ? <Text>אין הזמנות עדיין.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  providerName: { fontSize: 15, fontWeight: '600', flex: 1, textAlign: 'right' },
  itemCount: { fontSize: 13, color: '#666' },
  sentBadge: { fontSize: 12, color: '#1e7e34', fontWeight: '700' },
  draftBadge: { fontSize: 12, color: '#b8860b', fontWeight: '700' },
  chevron: { fontSize: 16, color: '#999' },
});
