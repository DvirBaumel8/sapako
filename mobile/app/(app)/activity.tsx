import React, { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteOrder, fetchOrdersForBranch } from '../../src/api/orders';
import { useBranch } from '../../src/branch/BranchContext';
import { useAlert } from '../../src/ui/AlertProvider';
import type { Order } from '../../src/api/types';
import { groupOrdersForActivity } from '../../src/order/groupOrdersForActivity';
import { OrderActivityRow } from '../../src/order/OrderActivityRow';
import { confirmOrderSent, revertOrderToDraft } from '../../src/api/orders';

export default function ActivityScreen() {
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
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

  const sections = useMemo(
    () => (visibleOrders ? groupOrdersForActivity(visibleOrders) : []),
    [visibleOrders],
  );

  const removeOrder = useMutation({
    mutationFn: (orderId: string) => deleteOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', selectedBranch!.id] });
    },
    onError: () => {
      showAlert({ title: 'שגיאה', message: 'מחיקת ההזמנה נכשלה. יש לנסות שוב.' });
    },
  });

  const resolveOrder = useMutation({
    mutationFn: ({ order, wasSent }: { order: Order; wasSent: boolean }) =>
      wasSent ? confirmOrderSent(order.id) : revertOrderToDraft(order.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', selectedBranch!.id] });
    },
    onError: () => {
      showAlert({ title: 'שגיאה', message: 'עדכון ההזמנה נכשל. יש לנסות שוב.' });
    },
  });

  const toggleExpanded = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const confirmDelete = (order: Order) => {
    showAlert({
      title: 'מחיקת הזמנה',
      message: `למחוק את ההזמנה עבור ${order.provider.name}? לא ניתן לשחזר פעולה זו.`,
      buttons: [
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחיקה', style: 'destructive', onPress: () => removeOrder.mutate(order.id) },
      ],
    });
  };

  return (
    <SectionList
      contentContainerStyle={styles.list}
      refreshing={isRefetching}
      onRefresh={refetch}
      sections={sections}
      keyExtractor={(order) => order.id}
      stickySectionHeadersEnabled
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{section.title}</Text>
          <Text style={styles.sectionHeaderCount}>{section.data.length}</Text>
        </View>
      )}
      renderItem={({ item: order }) => (
        <OrderActivityRow
          order={order}
          isExpanded={expandedOrderIds.has(order.id)}
          onToggleExpand={() => toggleExpanded(order.id)}
          onDelete={() => confirmDelete(order)}
          onResolve={(wasSent) => resolveOrder.mutate({ order, wasSent })}
        />
      )}
      ListEmptyComponent={!isLoading ? <Text>אין הזמנות עדיין.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Opaque, not transparent: with stickySectionHeadersEnabled this header
    // pins to the top while cards scroll underneath it, and a see-through
    // background would let their text bleed through behind it.
    backgroundColor: '#f5f5f5',
    paddingVertical: 8,
    marginTop: 4,
  },
  sectionHeaderText: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', textAlign: 'right' },
  sectionHeaderCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    backgroundColor: '#eee',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 22,
    textAlign: 'center',
  },
});
