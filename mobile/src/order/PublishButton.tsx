import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { publishOrder } from '../api/orders';
import { buildOrderMessage } from './buildOrderMessage';
import { toWhatsAppPhoneNumber } from '../utils/whatsappPhone';
import { useAlert } from '../ui/AlertProvider';
import type { Order, OrderItem } from '../api/types';

interface PublishButtonProps {
  order: Order;
  items: OrderItem[];
}

export function PublishButton({ order, items }: PublishButtonProps) {
  const showAlert = useAlert();
  const [isPublishing, setIsPublishing] = useState(false);
  // The root layout's SafeAreaView only reserves the top edge, so nothing
  // pads this button away from the bottom of the screen — the iPhone home
  // indicator on an installed PWA, or Android's gesture bar. Applied
  // unconditionally: the inset is zero on devices that have no such area.
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  const handlePublish = async () => {
    if (items.length === 0) return;
    setIsPublishing(true);
    try {
      // Open WhatsApp *before* marking the order published — everything the
      // message needs (provider name/phone, item snapshots) is already in
      // local state, so there's no need to round-trip through publish() just
      // to build it. This way a failed/cancelled WhatsApp launch leaves the
      // order in DRAFT (still editable, safe to retry) instead of silently
      // marking it as sent when it never actually reached WhatsApp.
      const message = buildOrderMessage({ ...order, items });
      const phoneDigitsOnly = toWhatsAppPhoneNumber(order.provider.phone);
      const url = `https://wa.me/${phoneDigitsOnly}?text=${encodeURIComponent(message)}`;
      // Hand off in a separate browsing context rather than navigating this
      // one. Assigning location.href would begin unloading the page, and the
      // browser cancels in-flight requests on unload — so the publishOrder
      // call below would never complete and the order would stay a draft
      // even though the message was sent, inviting a duplicate send.
      //
      // Called synchronously, before this function's first await: Safari
      // blocks window.open once the user-gesture chain is broken, which is
      // also why the old canOpenURL check is gone. wa.me redirects to the
      // WhatsApp app on mobile and to web.whatsapp.com on desktop, so there
      // is nothing left to feature-detect.
      const handedOff = window.open(url, '_blank');
      if (!handedOff) {
        // Blocked anyway. Navigating this tab always works, at the cost of
        // losing the publishOrder call — better than not sending the order.
        window.location.href = url;
      }
      try {
        await publishOrder(order.id);
      } catch {
        showAlert({
          title: 'ההודעה נשלחה, אך סימון ההזמנה נכשל',
          message: 'ההודעה כבר נפתחה ב-WhatsApp. אם ההזמנה עדיין מופיעה כטיוטה, אין צורך לשלוח שוב — יש לפנות לתמיכה אם הבעיה חוזרת.',
        });
      }
      router.replace('/');
    } catch {
      showAlert({ title: 'לא ניתן היה לפתוח את WhatsApp', message: 'ההזמנה נשמרה כטיוטה. ניתן לנסות שוב.' });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { marginBottom: 12 + bottomInset },
        pressed && styles.buttonPressed,
        (isPublishing || items.length === 0) && styles.buttonDisabled,
      ]}
      onPress={handlePublish}
      disabled={isPublishing || items.length === 0}
    >
      {isPublishing ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.buttonText}>פרסום לוואטסאפ</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 16,
    margin: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
