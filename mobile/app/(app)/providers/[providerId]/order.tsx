import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProductsForProvider } from '../../../../src/api/products';
import { createDraftOrder, addOrderItem, updateOrderItemQuantity, removeOrderItem, fetchOrdersForBranch } from '../../../../src/api/orders';
import { useBranch } from '../../../../src/branch/BranchContext';
import { useAuth } from '../../../../src/auth/AuthContext';
import type { Order, OrderItem, Product } from '../../../../src/api/types';
import { PublishButton } from '../../../../src/order/PublishButton';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';
import { findResumableDraft } from '../../../../src/order/findResumableDraft';

export default function OrderBuilderScreen() {
  const { providerId, providerName, sourceOrder } = useLocalSearchParams<{
    providerId: string;
    providerName?: string;
    sourceOrder?: string;
  }>();
  const { selectedBranch } = useBranch();
  const { userId } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [itemsByProductId, setItemsByProductId] = useState<Record<string, OrderItem>>({});
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const orderCreationRef = useRef<Promise<Order> | null>(null);
  const hasPromptedResumeRef = useRef(false);

  const { data: products } = useQuery({
    queryKey: ['products', providerId],
    queryFn: () => fetchProductsForProvider(providerId),
  });

  const { data: branchOrders } = useQuery({
    queryKey: ['orders', selectedBranch?.id],
    queryFn: () => fetchOrdersForBranch(selectedBranch!.id),
    enabled: !sourceOrder && !!selectedBranch,
  });

  const filteredProducts = useMemo(() => {
    if (!products) return products;
    const query = search.trim();
    if (!query) return products;
    return products.filter((product) => product.name.includes(query));
  }, [products, search]);

  useEffect(() => {
    const parsedSource: Order | null = sourceOrder ? JSON.parse(sourceOrder) : null;

    if (parsedSource?.status === 'DRAFT') {
      // Resume the existing draft as-is — no new order, reuse its items directly.
      setOrder(parsedSource);
      setItemsByProductId(
        Object.fromEntries(parsedSource.items.map((item) => [item.productId, item])),
      );
      return;
    }

    if (parsedSource?.status === 'PUBLISHED') {
      // "Continue" a sent order: build a fresh draft pre-filled with the same items.
      createDraftOrder(selectedBranch!.id, providerId).then(async (created) => {
        const addedItems = await Promise.all(
          parsedSource.items.map((item) =>
            addOrderItem(created.id, {
              productId: item.productId,
              productNameSnapshot: item.productNameSnapshot,
              unitType: item.unitType,
              quantity: item.quantity,
            }),
          ),
        );
        setItemsByProductId(
          Object.fromEntries(addedItems.filter((i) => i.productId).map((i) => [i.productId, i])),
        );
        setOrder(created);
      });
    }
    // Brand new, no source order: don't create anything yet — an empty draft
    // is meaningless. It's created lazily on the first real quantity change.
  }, [providerId]);

  useEffect(() => {
    if (sourceOrder || !branchOrders || !userId || hasPromptedResumeRef.current || order) return;
    const resumable = findResumableDraft(branchOrders, providerId, userId);
    if (!resumable) return;

    hasPromptedResumeRef.current = true;
    Alert.alert(
      'יש הזמנה פתוחה לספק זה',
      'יש לך הזמנה שטרם הושלמה לספק הזה. להמשיך אותה?',
      [
        { text: 'לא, התחל חדש', style: 'cancel' },
        {
          text: 'כן, המשך',
          onPress: () => {
            setOrder(resumable);
            setItemsByProductId(
              Object.fromEntries(resumable.items.map((item) => [item.productId, item])),
            );
          },
        },
      ],
    );
  }, [sourceOrder, branchOrders, userId, providerId, order]);

  // Creates the draft order on first use rather than eagerly on screen open,
  // so browsing without adding anything never leaves a meaningless 0-item
  // draft behind. Cached in a ref so concurrent calls share one creation.
  const ensureOrder = (): Promise<Order> => {
    if (order) return Promise.resolve(order);
    if (!orderCreationRef.current) {
      orderCreationRef.current = createDraftOrder(selectedBranch!.id, providerId).then((created) => {
        setOrder(created);
        return created;
      });
    }
    return orderCreationRef.current;
  };

  const setQuantity = async (product: Product, quantity: number) => {
    const existing = itemsByProductId[product.id];
    if (quantity <= 0) {
      if (existing && order) {
        await removeOrderItem(order.id, existing.id);
        setItemsByProductId((prev) => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
      }
      return;
    }
    const currentOrder = await ensureOrder();
    if (existing) {
      const updated = await updateOrderItemQuantity(currentOrder.id, existing.id, quantity);
      setItemsByProductId((prev) => ({ ...prev, [product.id]: updated }));
    } else {
      const created = await addOrderItem(currentOrder.id, { productId: product.id, quantity });
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
