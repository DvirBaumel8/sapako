import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProductsForProvider } from '../../../../src/api/products';
import { createDraftOrder, addOrderItem, updateOrderItemQuantity, removeOrderItem, fetchOrdersForBranch } from '../../../../src/api/orders';
import { useBranch } from '../../../../src/branch/BranchContext';
import { useAuth } from '../../../../src/auth/AuthContext';
import type { Order, OrderItem, Product } from '../../../../src/api/types';
import { PublishButton } from '../../../../src/order/PublishButton';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';
import { AddUnknownProductModal } from '../../../../src/order/AddUnknownProductModal';
import { findResumableDraft } from '../../../../src/order/findResumableDraft';
import { fuzzySearch } from '../../../../src/utils/fuzzySearch';
import { useAlert } from '../../../../src/ui/AlertProvider';

export default function OrderBuilderScreen() {
  const { providerId, providerName, sourceOrder, highlightProductId } = useLocalSearchParams<{
    providerId: string;
    providerName?: string;
    sourceOrder?: string;
    highlightProductId?: string;
  }>();
  const { selectedBranch } = useBranch();
  const { role, userId } = useAuth();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const [order, setOrder] = useState<Order | null>(null);
  const [itemsByProductId, setItemsByProductId] = useState<Record<string, OrderItem>>({});
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const orderCreationRef = useRef<Promise<Order> | null>(null);
  const listRef = useRef<FlatList<Product>>(null);
  const hasScrolledRef = useRef(false);
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
    return fuzzySearch(products, search, (product) => product.name);
  }, [products, search]);

  useEffect(() => {
    if (!highlightProductId || !filteredProducts || hasScrolledRef.current) return;
    const index = filteredProducts.findIndex((product) => product.id === highlightProductId);
    if (index === -1) return;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    hasScrolledRef.current = true;
  }, [filteredProducts, highlightProductId]);

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
    showAlert({
      title: 'יש הזמנה פתוחה לספק זה',
      message: 'יש לך הזמנה שטרם הושלמה לספק הזה. להמשיך אותה?',
      buttons: [
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
    });
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
      if (role !== 'ADMIN') {
        showAlert({
          title: 'לא נמצא מוצר תואם',
          message: `לא נמצא מוצר עם ברקוד ${barcode} בקטלוג של הספק הזה.`,
        });
        return;
      }
      showAlert({
        title: 'לא נמצא מוצר תואם',
        message: `לא נמצא מוצר עם ברקוד ${barcode} בקטלוג של הספק הזה.`,
        buttons: [
          { text: 'ביטול', style: 'cancel' },
          { text: 'הוספת מוצר חדש', onPress: () => setUnknownBarcode(barcode) },
        ],
      });
      return;
    }
    const currentQuantity = itemsByProductId[match.id]?.quantity ?? 0;
    setQuantity(match, currentQuantity + 1);
  };

  const handleUnknownProductCreated = (product: Product) => {
    setUnknownBarcode(null);
    queryClient.invalidateQueries({ queryKey: ['products', providerId] });
    setQuantity(product, 1);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: providerName ?? '',
          headerRight:
            role === 'ADMIN'
              ? () => (
                  <Pressable
                    onPress={() => router.push(`/providers/${providerId}/edit`)}
                    style={styles.editButton}
                  >
                    <Text style={styles.editButtonText}>✎</Text>
                  </Pressable>
                )
              : undefined,
        }}
      />
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
      {unknownBarcode && (
        <AddUnknownProductModal
          visible
          providerId={providerId}
          barcode={unknownBarcode}
          onClose={() => setUnknownBarcode(null)}
          onCreated={handleUnknownProductCreated}
        />
      )}
      <FlatList
        ref={listRef}
        data={filteredProducts}
        keyExtractor={(product) => product.id}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }, 50);
        }}
        renderItem={({ item: product }) => {
          const currentQuantity = itemsByProductId[product.id]?.quantity ?? 0;
          const isHighlighted = product.id === highlightProductId;
          return (
            <View style={[styles.card, isHighlighted && styles.cardHighlighted]}>
              <View style={styles.productNameRow}>
                <Text style={styles.productName}>{product.name}</Text>
                {role === 'ADMIN' && (
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      router.push({
                        pathname: '/products/[productId]/edit',
                        params: {
                          productId: product.id,
                          productName: product.name,
                          unitType: product.unitType,
                          barcode: product.barcode ?? '',
                          providerId,
                        },
                      })
                    }
                  >
                    <Text style={styles.productEditIcon}>✎</Text>
                  </Pressable>
                )}
              </View>
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
  cardHighlighted: {
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  productName: { fontSize: 15, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
  productNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productEditIcon: { fontSize: 16, color: '#2563eb', paddingHorizontal: 4 },
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
  editButton: { paddingHorizontal: 12 },
  editButtonText: { fontSize: 20, color: '#2563eb' },
});
