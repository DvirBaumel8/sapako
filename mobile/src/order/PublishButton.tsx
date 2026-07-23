import React, { useState } from 'react';
import { Alert, Button, Linking } from 'react-native';
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

  return <Button title={isPublishing ? 'מפרסם…' : 'פרסום לוואטסאפ'} onPress={handlePublish} />;
}
