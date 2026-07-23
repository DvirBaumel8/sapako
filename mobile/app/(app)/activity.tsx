import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchOrdersForBranch } from '../../src/api/orders';
import { useBranch } from '../../src/branch/BranchContext';

export default function ActivityScreen() {
  const { selectedBranch } = useBranch();
  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders', selectedBranch!.id],
    queryFn: () => fetchOrdersForBranch(selectedBranch!.id),
  });

  return (
    <FlatList
      contentContainerStyle={styles.list}
      refreshing={isRefetching}
      onRefresh={refetch}
      data={orders}
      keyExtractor={(order) => order.id}
      renderItem={({ item: order }) => (
        <View style={styles.row}>
          <Text style={styles.providerName}>{order.provider.name}</Text>
          <Text style={styles.itemCount}>{order.items.length} פריטים</Text>
          <Text style={order.status === 'PUBLISHED' ? styles.sentBadge : styles.draftBadge}>
            {order.status === 'PUBLISHED' ? 'נשלחה' : 'טיוטה'}
          </Text>
        </View>
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
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  providerName: { fontSize: 15, fontWeight: '600', flex: 1 },
  itemCount: { fontSize: 13, color: '#666', marginRight: 12 },
  sentBadge: { fontSize: 12, color: '#1e7e34', fontWeight: '700' },
  draftBadge: { fontSize: 12, color: '#b8860b', fontWeight: '700' },
});
