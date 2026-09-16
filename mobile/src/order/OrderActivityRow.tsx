import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Order } from '../api/types';
import { formatQuantity } from '../products/unitTypes';
import { orderStatusBadge } from './orderStatusBadge';
import { useAlert } from '../ui/AlertProvider';

const NAME_TRUNCATE_LENGTH = 22;

function truncate(name: string): string {
  return name.length > NAME_TRUNCATE_LENGTH ? `${name.slice(0, NAME_TRUNCATE_LENGTH)}…` : name;
}

function openInOrderBuilder(order: Order) {
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
}

export interface OrderActivityRowProps {
  order: Order;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onResolve: (wasSent: boolean) => void;
  /**
   * The notifications screen's own unread marker (a dot, bold provider
   * name, tinted row) — the Recent Activity screen never sets this, since
   * every order there has already been "seen" by definition.
   */
  unread?: boolean;
}

/**
 * One order's row: collapsed to provider/item-count/status, expanding to
 * its item list plus whichever action fits the status — the
 * awaiting-confirmation yes/no question, or a link to keep editing.
 *
 * Shared by the Recent Activity screen and the notifications screen (a
 * notification just wraps an order) so the two present an order identically
 * rather than drifting into two slightly different views of the same data.
 */
export function OrderActivityRow({
  order,
  isExpanded,
  onToggleExpand,
  onDelete,
  onResolve,
  unread = false,
}: OrderActivityRowProps) {
  const showAlert = useAlert();
  const orderedItems = order.items.filter((item) => item.quantity > 0);
  const badge = orderStatusBadge(order.status);

  return (
    <View style={[styles.card, unread && styles.cardUnread]}>
      <Pressable style={styles.row} onPress={onToggleExpand}>
        {unread && <View testID="unread-dot" style={styles.unreadDot} />}
        <Text style={[styles.providerName, unread && styles.providerNameUnread]}>
          {order.provider.name}
        </Text>
        <Text style={styles.itemCount}>{order.items.length} פריטים</Text>
        <Text style={styles[`${badge.tone}Badge`]}>{badge.label}</Text>
        <Pressable hitSlop={8} style={styles.deleteButton} onPress={onDelete}>
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
            <View style={styles.awaitingActions}>
              <Text style={styles.awaitingQuestion}>נשלחה ההזמנה בוואטסאפ?</Text>
              <View style={styles.awaitingButtons}>
                <Pressable
                  style={[styles.awaitingButton, styles.awaitingConfirm]}
                  onPress={() => onResolve(true)}
                >
                  <Text style={styles.awaitingConfirmText}>כן, נשלחה</Text>
                </Pressable>
                <Pressable
                  style={[styles.awaitingButton, styles.awaitingRevert]}
                  onPress={() => onResolve(false)}
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
}

const styles = StyleSheet.create({
  card: { borderBottomWidth: 1, borderBottomColor: '#eee' },
  cardUnread: { backgroundColor: '#eef2ff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563eb' },
  providerName: { fontSize: 15, fontWeight: '600', flex: 1, textAlign: 'right' },
  providerNameUnread: { fontWeight: '800' },
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
