import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchNotifications,
  markNotificationRead,
  deleteNotification,
  type AdminNotificationItem,
} from '../../src/api/notifications';
import { confirmOrderSent, revertOrderToDraft } from '../../src/api/orders';
import type { Order } from '../../src/api/types';
import { OrderActivityRow } from '../../src/order/OrderActivityRow';
import { useAlert } from '../../src/ui/AlertProvider';
import { ADMIN_NOTIFICATIONS_QUERY_KEY, UNREAD_COUNT_QUERY_KEY } from '../../src/notifications/queryKeys';

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ADMIN_NOTIFICATIONS_QUERY_KEY,
    queryFn: ({ pageParam }) => fetchNotifications({ offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    // A short final page (or an empty one) means there is nothing left to
    // fetch; anything else advances the offset by what's been loaded so far.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.flat().length,
  });

  const notifications = useMemo(() => data?.pages.flat() ?? [], [data]);

  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: ADMIN_NOTIFICATIONS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidateNotifications,
  });

  const removeNotification = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: invalidateNotifications,
    onError: () => {
      showAlert({ title: 'שגיאה', message: 'מחיקת ההתראה נכשלה. יש לנסות שוב.' });
    },
  });

  const resolveOrder = useMutation({
    mutationFn: ({ order, wasSent }: { order: Order; wasSent: boolean }) =>
      wasSent ? confirmOrderSent(order.id) : revertOrderToDraft(order.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_NOTIFICATIONS_QUERY_KEY }),
    onError: () => {
      showAlert({ title: 'שגיאה', message: 'עדכון ההזמנה נכשל. יש לנסות שוב.' });
    },
  });

  // Opening a notification is what "reads" it — collapsing it back does not
  // re-mark it unread, and it only fires the write once per notification.
  const toggleExpanded = (notification: AdminNotificationItem) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(notification.id)) {
        next.delete(notification.id);
      } else {
        next.add(notification.id);
        if (!notification.isRead) {
          markRead.mutate(notification.id);
        }
      }
      return next;
    });
  };

  return (
    <FlatList
      contentContainerStyle={styles.list}
      refreshing={isRefetching}
      onRefresh={refetch}
      data={notifications}
      keyExtractor={(notification) => notification.id}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      }}
      renderItem={({ item }) => (
        <OrderActivityRow
          order={item.order}
          isExpanded={expandedIds.has(item.id)}
          onToggleExpand={() => toggleExpanded(item)}
          onDelete={() => removeNotification.mutate(item.id)}
          onResolve={(wasSent) => resolveOrder.mutate({ order: item.order, wasSent })}
          unread={!item.isRead}
        />
      )}
      ListEmptyComponent={!isLoading ? <Text style={styles.empty}>אין התראות.</Text> : null}
      ListFooterComponent={
        isFetchingNextPage ? <Text style={styles.loadingMore}>טוען עוד…</Text> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 24, color: '#666' },
  loadingMore: { textAlign: 'center', paddingVertical: 16, color: '#666', fontSize: 13 },
});
