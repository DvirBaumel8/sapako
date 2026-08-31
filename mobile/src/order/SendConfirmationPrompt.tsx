import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmOrderSent,
  fetchOrdersAwaitingConfirmation,
  revertOrderToDraft,
} from '../api/orders';
import { useBranch } from '../branch/BranchContext';
import { formatTimeAgo } from './timeAgo';
import { colors, radius, spacing } from '../ui/theme';

/**
 * Asks whether a WhatsApp message was actually sent.
 *
 * The app hands an order to wa.me and gets nothing back — no receipt, no
 * callback — so the send is unobservable. Rather than assume it happened,
 * the order waits in AWAITING_CONFIRMATION and this asks the one person who
 * knows, the next time they come back to the app.
 *
 * The pending list comes from the server, not from this device: the user may
 * confirm from a different phone, after a reload, or after the service worker
 * updated, and an order nobody answered for has to keep asking.
 */
export function SendConfirmationPrompt() {
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  const [skippedOrderIds, setSkippedOrderIds] = useState<string[]>([]);

  const branchId = selectedBranch?.id;
  const { data: awaiting, refetch } = useQuery({
    queryKey: ['orders', branchId, 'awaiting-confirmation'],
    queryFn: () => fetchOrdersAwaitingConfirmation(branchId!),
    enabled: !!branchId,
  });

  // Returning from WhatsApp is the moment the answer is knowable, and it is
  // not a navigation the router can see. AppState would work too, but on web
  // it is a shim over exactly this event, and this app runs only in a
  // browser.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refetch]);

  const settle = (resolve: (orderId: string) => Promise<unknown>) => ({
    // Wrapped rather than passed directly: React Query invokes the mutation
    // function with (variables, context), and the second argument has no
    // business being forwarded to an API call.
    mutationFn: (orderId: string) => resolve(orderId),
    onSettled: () => {
      // Both the awaiting list and the activity list change when an order is
      // answered for.
      queryClient.invalidateQueries({ queryKey: ['orders', branchId] });
      queryClient.invalidateQueries({
        queryKey: ['orders', branchId, 'awaiting-confirmation'],
      });
    },
  });

  const confirm = useMutation(settle(confirmOrderSent));
  const revert = useMutation(settle(revertOrderToDraft));

  const order = awaiting?.find((candidate) => !skippedOrderIds.includes(candidate.id));
  if (!order) return null;

  const isBusy = confirm.isPending || revert.isPending;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>נשלחה ההזמנה ל{order.provider.name}?</Text>
          <Text style={styles.subtitle}>
            {order.handedOffAt
              ? `נפתחה ב-WhatsApp ${formatTimeAgo(order.handedOffAt)}`
              : 'נפתחה ב-WhatsApp'}
            {' · '}
            {order.items.length} מוצרים
          </Text>

          {isBusy ? (
            <ActivityIndicator style={styles.spinner} color={colors.accent} />
          ) : (
            <View style={styles.buttons}>
              <Pressable
                style={[styles.button, styles.confirmButton]}
                onPress={() => confirm.mutate(order.id)}
              >
                <Text style={styles.confirmText}>כן, נשלחה</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.revertButton]}
                onPress={() => revert.mutate(order.id)}
              >
                <Text style={styles.revertText}>לא, עדיין לא</Text>
              </Pressable>
            </View>
          )}

          {/*
            Deliberately not a dismiss that resolves anything. Skipping leaves
            the order awaiting, so it is asked again next time rather than
            being guessed at — which is the whole point of the state.
          */}
          <Pressable
            onPress={() => setSkippedOrderIds((previous) => [...previous, order.id])}
            disabled={isBusy}
          >
            <Text style={styles.later}>אחר כך</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'right' },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'right' },
  spinner: { marginVertical: spacing.lg },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.control,
    alignItems: 'center',
  },
  confirmButton: { backgroundColor: '#25D366' },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  revertButton: { backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border },
  revertText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  later: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    paddingVertical: spacing.sm,
  },
});
