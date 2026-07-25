import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProductsForProvider } from '../../../../src/api/products';
import { createDraftOrder, addOrderItem, updateOrderItemQuantity } from '../../../../src/api/orders';
import { useBranch } from '../../../../src/branch/BranchContext';
import type { Order, OrderItem, Product } from '../../../../src/api/types';
import { PublishButton } from '../../../../src/order/PublishButton';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';

export default function OrderBuilderScreen() {
  const { providerId, providerName } = useLocalSearchParams<{ providerId: string; providerName?: string }>();
  const { selectedBranch } = useBranch();
  const [order, setOrder] = useState<Order | null>(null);
  const [itemsByProductId, setItemsByProductId] = useState<Record<string, OrderItem>>({});
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [search, setSearch] = useState('');

  const { data: products } = useQuery({
    queryKey: ['products', providerId],
    queryFn: () => fetchProductsForProvider(providerId),
  });

  const filteredProducts = useMemo(() => {
    if (!products) return products;
    const query = search.trim();
    if (!query) return products;
    return products.filter((product) => product.name.includes(query));
  }, [products, search]);

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
      <Stack.Screen options={{ title: providerName ?? '' }} />
      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          placeholder="חפש מוצר…"
          value={search}
          onChangeText={setSearch}
        />
        <Pressable onPress={() => setIsScannerVisible(true)} style={styles.scanButton}>
          <Text style={styles.scanButtonText}>סריקת ברקוד</Text>
        </Pressable>
      </View>
      <BarcodeScannerModal
        visible={isScannerVisible}
        onScanned={handleBarcodeScanned}
        onClose={() => setIsScannerVisible(false)}
      />
      <FlatList
        data={filteredProducts}
        keyExtractor={(product) => product.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: product }) => {
          const currentQuantity = itemsByProductId[product.id]?.quantity ?? 0;
          return (
            <View style={styles.card}>
              <Text style={styles.productName}>{product.name}</Text>
              <View style={styles.rowBottom}>
                <View style={styles.unitBadge}>
                  <Text style={styles.unitBadgeText}>{product.unitType}</Text>
                </View>
                <View style={styles.stepper}>
                  {/* RN mirrors flexDirection:'row' under RTL, so JSX order here is
                      reversed on purpose: this renders visually as [−] [qty] [+]. */}
                  <Pressable onPress={() => setQuantity(product, currentQuantity + 1)} style={styles.stepperButton}>
                    <Text style={styles.stepperButtonText}>+</Text>
                  </Pressable>
                  <TextInput
                    style={styles.quantityInput}
                    keyboardType="number-pad"
                    value={String(currentQuantity)}
                    onChangeText={(text) => setQuantity(product, Number(text) || 0)}
                  />
                  <Pressable
                    onPress={() => setQuantity(product, Math.max(0, currentQuantity - 1))}
                    style={styles.stepperButton}
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          products ? <Text style={styles.emptyText}>לא נמצאו מוצרים תואמים לחיפוש.</Text> : null
        }
      />
      {order && <PublishButton order={order} items={Object.values(itemsByProductId)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  search: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'right',
    fontSize: 15,
  },
  scanButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  scanButtonText: { fontSize: 13, color: '#333' },
  list: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  productName: { fontSize: 15, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unitBadge: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unitBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 4,
  },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  stepperButtonText: { fontSize: 18, fontWeight: '700', color: '#333' },
  quantityInput: { width: 36, textAlign: 'center', fontSize: 15, fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 24, color: '#666' },
});
