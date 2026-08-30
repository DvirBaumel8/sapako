import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteOrder, fetchOrdersForBranch } from '../../src/api/orders';
import { useBranch } from '../../src/branch/BranchContext';
import { useAlert } from '../../src/ui/AlertProvider';
import type { Order } from '../../src/api/types';

const NAME_TRUNCATE_LENGTH = 22;

function truncate(name: string): string {
  return name.length > NAME_TRUNCATE_LENGTH ? `${name.slice(0, NAME_TRUNCATE_LENGTH)}…` : name;
}

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

  const removeOrder = useMutation({
    mutationFn: (orderId: string) => deleteOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', selectedBranch!.id] });
    },
    onError: () => {
      showAlert({ title: 'שגיאה', message: 'מחיקת ההזמנה נכשלה. יש לנסות שוב.' });
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

  const openInOrderBuilder = (order: Order) => {
    router.push({
      pathname: '/providers/[providerId]/order',
      params: {
        providerId: order.providerId,
        providerName: order.provider.name,
        // DRAFT: resume this exact order. PUBLISHED: start a new draft
        // pre-filled with these items (order.tsx decides which based on status).
        sourceOrder: JSON.stringify(order),
      },
    });
  };

  return (
    <FlatList
      contentContainerStyle={styles.list}
      refreshing={isRefetching}
      onRefresh={refetch}
      data={visibleOrders}
      keyExtractor={(order) => order.id}
      renderItem={({ item: order }) => {
        const isExpanded = expandedOrderIds.has(order.id);
        const orderedItems = order.items.filter((item) => item.quantity > 0);
        return (
          <View style={styles.card}>
            <Pressable style={styles.row} onPress={() => toggleExpanded(order.id)}>
              <Text style={styles.providerName}>{order.provider.name}</Text>
              <Text style={styles.itemCount}>{order.items.length} פריטים</Text>
              <Text style={order.status === 'PUBLISHED' ? styles.sentBadge : styles.draftBadge}>
                {order.status === 'PUBLISHED' ? 'נשלחה' : 'טיוטה'}
              </Text>
              <Pressable
                hitSlop={8}
                style={styles.deleteButton}
                onPress={() => confirmDelete(order)}
              >
                <Text style={styles.deleteButtonText}>🗑</Text>
              </Pressable>
              <Text style={styles.chevron}>{isExpanded ? '︿' : '‹'}</Text>
            </Pressable>
            {isExpanded && (
              <View style={styles.details}>
                {orderedItems.map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.detailRow}
                    onLongPress={() => showAlert({ title: item.productNameSnapshot })}
                  >
                    <Text style={styles.detailQuantity}>
                      {item.quantity} {item.unitType}
                    </Text>
                    <Text style={styles.detailName}>{truncate(item.productNameSnapshot)}</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.continueButton} onPress={() => openInOrderBuilder(order)}>
                  <Text style={styles.continueButtonText}>
                    {order.status === 'PUBLISHED' ? 'פתיחת הזמנה חדשה עם אותם פריטים ›' : 'המשך עריכת הזמנה ›'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      }}
      ListEmptyComponent={!isLoading ? <Text>אין הזמנות עדיין.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  card: { borderBottomWidth: 1, borderBottomColor: '#eee' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  providerName: { fontSize: 15, fontWeight: '600', flex: 1, textAlign: 'right' },
  itemCount: { fontSize: 13, color: '#666' },
  sentBadge: { fontSize: 12, color: '#1e7e34', fontWeight: '700' },
  draftBadge: { fontSize: 12, color: '#b8860b', fontWeight: '700' },
  deleteButton: { paddingHorizontal: 4 },
  deleteButtonText: { fontSize: 15 },
  chevron: { fontSize: 16, color: '#999' },
  details: { paddingBottom: 12, gap: 6 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  detailName: { fontSize: 14, color: '#1a1a1a', textAlign: 'right' },
  detailQuantity: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
  continueButton: { paddingVertical: 8, alignItems: 'flex-end' },
  continueButtonText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
});
