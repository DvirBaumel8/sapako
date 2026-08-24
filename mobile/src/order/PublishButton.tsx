import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { publishOrder } from '../api/orders';
import { buildOrderMessage } from './buildOrderMessage';
import { toWhatsAppPhoneNumber } from '../utils/whatsappPhone';
import type { Order, OrderItem } from '../api/types';

interface PublishButtonProps {
  order: Order;
  items: OrderItem[];
}

export function PublishButton({ order, items }: PublishButtonProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  // The root layout's SafeAreaView only reserves the top edge, so nothing
  // pads content away from Android's gesture/nav bar at the bottom — this
  // button ends up rendered mostly underneath it. iOS's home indicator area
  // doesn't have this problem, so only add the inset on Android.
  const insets = useSafeAreaInsets();
  const androidBottomInset = Platform.OS === 'android' ? insets.bottom : 0;

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
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert(
          'לא ניתן לפתוח את WhatsApp',
          'ודאו ש-WhatsApp מותקן במכשיר ונסו שוב. ההזמנה נשמרה כטיוטה.',
        );
        return;
      }
      await Linking.openURL(url);
      try {
        await publishOrder(order.id);
      } catch {
        Alert.alert(
          'ההודעה נשלחה, אך סימון ההזמנה נכשל',
          'ההודעה כבר נפתחה ב-WhatsApp. אם ההזמנה עדיין מופיעה כטיוטה, אין צורך לשלוח שוב — יש לפנות לתמיכה אם הבעיה חוזרת.',
        );
      }
      router.replace('/');
    } catch {
      Alert.alert('לא ניתן היה לפתוח את WhatsApp', 'ההזמנה נשמרה כטיוטה. ניתן לנסות שוב.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { marginBottom: 12 + androidBottomInset },
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
