import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProductsForProvider } from '../../../../src/api/products';
import { createDraftOrder, addOrderItem, updateOrderItemQuantity } from '../../../../src/api/orders';
import { useBranch } from '../../../../src/branch/BranchContext';
import type { Order, OrderItem, Product } from '../../../../src/api/types';
import { PublishButton } from '../../../../src/order/PublishButton';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';

export default function OrderBuilderScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { selectedBranch } = useBranch();
  const [order, setOrder] = useState<Order | null>(null);
  const [itemsByProductId, setItemsByProductId] = useState<Record<string, OrderItem>>({});
  const [isScannerVisible, setIsScannerVisible] = useState(false);

  const { data: products } = useQuery({
    queryKey: ['products', providerId],
    queryFn: () => fetchProductsForProvider(providerId),
  });

  useEffect(() => {
    createDraftOrder(selectedBranch!.id, providerId).then(setOrder);
  }, [providerId]);

  const setQuantity = async (product: Product, quantity: number) => {
    if (!order) return;
    const existing = itemsByProductId[product.id];
    if (quantity <= 0) {
      return; // removing items is handled by a dedicated "remove" affordance, not covered by the stepper reaching 0 in this pass
    }
    if (existing) {
      const updated = await updateOrderItemQuantity(order.id, existing.id, quantity);
      setItemsByProductId((prev) => ({ ...prev, [product.id]: updated }));
    } else {
      const created = await addOrderItem(order.id, { productId: product.id, quantity });
      setItemsByProductId((prev) => ({ ...prev, [product.id]: created }));
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    const match = products?.find((product) => product.barcode === barcode);
    if (!match) {
      Alert.alert('לא נמצא מוצר תואם', `לא נמצא מוצר עם ברקוד ${barcode} בקטלוג של הספק הזה.`);
      return;
    }
    const currentQuantity = itemsByProductId[match.id]?.quantity ?? 0;
    setQuantity(match, currentQuantity + 1);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setIsScannerVisible(true)} style={styles.scanButton}>
        <Text>סריקת ברקוד</Text>
      </Pressable>
      <BarcodeScannerModal
        visible={isScannerVisible}
        onScanned={handleBarcodeScanned}
        onClose={() => setIsScannerVisible(false)}
      />
      <FlatList
        data={products}
        keyExtractor={(product) => product.id}
        renderItem={({ item: product }) => {
          const currentQuantity = itemsByProductId[product.id]?.quantity ?? 0;
          return (
            <View style={styles.row}>
              <Text style={styles.productName}>{product.name}</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setQuantity(product, Math.max(0, currentQuantity - 1))}
                  style={styles.stepperButton}
                >
                  <Text>-</Text>
                </Pressable>
                <TextInput
                  style={styles.quantityInput}
                  keyboardType="number-pad"
                  value={String(currentQuantity)}
                  onChangeText={(text) => setQuantity(product, Number(text) || 0)}
                />
                <Pressable onPress={() => setQuantity(product, currentQuantity + 1)} style={styles.stepperButton}>
                  <Text>+</Text>
                </Pressable>
                <Text style={styles.unit}>{product.unitType}</Text>
              </View>
            </View>
          );
        }}
      />
      {order && <PublishButton order={order} items={Object.values(itemsByProductId)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  productName: { fontSize: 15, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 6 },
  quantityInput: { width: 40, textAlign: 'center', borderWidth: 1, borderRadius: 6, padding: 4 },
  unit: { width: 48, fontSize: 12, color: '#666' },
  scanButton: { margin: 12, padding: 12, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
});
