import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteOrder, fetchOrdersForBranch } from '../../src/api/orders';
import { useBranch } from '../../src/branch/BranchContext';
import { useAlert } from '../../src/ui/AlertProvider';
import type { Order } from '../../src/api/types';
import { formatQuantity } from '../../src/products/unitTypes';
import { orderStatusBadge } from '../../src/order/orderStatusBadge';
import { confirmOrderSent, revertOrderToDraft } from '../../src/api/orders';

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
        const badge = orderStatusBadge(order.status);
        return (
          <View style={styles.card}>
            <Pressable style={styles.row} onPress={() => toggleExpanded(order.id)}>
              <Text style={styles.providerName}>{order.provider.name}</Text>
              <Text style={styles.itemCount}>{order.items.length} פריטים</Text>
              <Text style={styles[`${badge.tone}Badge`]}>{badge.label}</Text>
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
                      {formatQuantity(item.quantity)} {item.unitType}
                    </Text>
                    <Text style={styles.detailName}>{truncate(item.productNameSnapshot)}</Text>
                  </Pressable>
                ))}
                {order.status === 'AWAITING_CONFIRMATION' ? (
                  /*
                    Resolvable from here as well as from the prompt: after a
                    run of orders there can be several waiting, and answering
                    them one modal at a time is slower than seeing the list.
                  */
                  <View style={styles.awaitingActions}>
                    <Text style={styles.awaitingQuestion}>נשלחה ההזמנה בוואטסאפ?</Text>
                    <View style={styles.awaitingButtons}>
                      <Pressable
                        style={[styles.awaitingButton, styles.awaitingConfirm]}
                        onPress={() => resolveOrder.mutate({ order, wasSent: true })}
                      >
                        <Text style={styles.awaitingConfirmText}>כן, נשלחה</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.awaitingButton, styles.awaitingRevert]}
                        onPress={() => resolveOrder.mutate({ order, wasSent: false })}
                      >
                        <Text style={styles.awaitingRevertText}>לא, עדיין לא</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={styles.continueButton} onPress={() => openInOrderBuilder(order)}>
                    <Text style={styles.continueButtonText}>
                      {order.status === 'PUBLISHED' ? 'פתיחת הזמנה חדשה עם אותם פריטים ›' : 'המשך עריכת הזמנה ›'}
                    </Text>
                  </Pressable>
                )}
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
  // Blue rather than another warm tone: it has to read as distinct from
  // the amber draft badge at a glance, which is the whole point.
  awaitingBadge: { fontSize: 12, color: '#2563eb', fontWeight: '700' },
  deleteButton: { paddingHorizontal: 4 },
  deleteButtonText: { fontSize: 15 },
  chevron: { fontSize: 16, color: '#999' },
  details: { paddingBottom: 12, gap: 6 },
  awaitingActions: { gap: 8, marginTop: 4 },
  awaitingQuestion: { fontSize: 13, color: '#666', textAlign: 'right' },
  awaitingButtons: { flexDirection: 'row', gap: 8 },
  awaitingButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  awaitingConfirm: { backgroundColor: '#25D366' },
  awaitingConfirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  awaitingRevert: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' },
  awaitingRevertText: { color: '#1a1a1a', fontSize: 14, fontWeight: '600' },
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
