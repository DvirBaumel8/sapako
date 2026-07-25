import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { publishOrder } from '../api/orders';
import { buildOrderMessage } from './buildOrderMessage';
import type { Order, OrderItem } from '../api/types';

interface PublishButtonProps {
  order: Order;
  items: OrderItem[];
}

export function PublishButton({ order, items }: PublishButtonProps) {
  const [isPublishing, setIsPublishing] = useState(false);

  const handlePublish = async () => {
    if (items.length === 0) {
      Alert.alert('יש להוסיף לפחות פריט אחד לפני הפרסום.');
      return;
    }
    setIsPublishing(true);
    try {
      const publishedOrder = await publishOrder(order.id);
      const message = buildOrderMessage(publishedOrder);
      const phoneDigitsOnly = publishedOrder.provider.phone.replace(/[^\d]/g, '');
      const url = `https://wa.me/${phoneDigitsOnly}?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert(
          'ההזמנה נשמרה, אך לא ניתן היה לפתוח את WhatsApp',
          'ההזמנה פורסמה בהצלחה. יש לפתוח את WhatsApp ידנית כדי לשלוח אותה.',
        );
        router.replace('/');
        return;
      }
      await Linking.openURL(url);
      router.replace('/');
    } catch {
      Alert.alert('לא ניתן היה לפרסם את ההזמנה', 'יש לבדוק את החיבור לאינטרנט ולנסות שוב.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isPublishing && styles.buttonDisabled]}
      onPress={handlePublish}
      disabled={isPublishing}
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
