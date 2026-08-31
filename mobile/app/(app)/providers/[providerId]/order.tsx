import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProductsForProvider } from '../../../../src/api/products';
import {
  createDraftOrder,
  addOrderItem,
  updateOrderItemQuantity,
  updateOrderItemUnit,
  removeOrderItem,
  fetchOrdersForBranch,
} from '../../../../src/api/orders';
import { useBranch } from '../../../../src/branch/BranchContext';
import { useAuth } from '../../../../src/auth/AuthContext';
import type { Order, OrderItem, Product } from '../../../../src/api/types';
import { PublishButton } from '../../../../src/order/PublishButton';
import { createQuantityWriter } from '../../../../src/order/createQuantityWriter';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';
import { AddUnknownProductModal } from '../../../../src/order/AddUnknownProductModal';
import { findResumableDraft } from '../../../../src/order/findResumableDraft';
import { fuzzySearch } from '../../../../src/utils/fuzzySearch';
import { useAlert } from '../../../../src/ui/AlertProvider';
import { formatQuantity, isWeightUnit, quantityStep } from '../../../../src/products/unitTypes';
import { UnitPickerSheet } from '../../../../src/order/UnitPickerSheet';

// Product rows are a fixed height, measured from the running app. Declaring
// it lets the list jump straight to any row: without it, scrollToIndex cannot
// reach a row outside the rendered window, and its own averageItemLength
// estimate reads ~82 against a real pitch of 104 — so every retry recomputed
// the same wrong offset and the scroll stopped ~80 rows short.
const ROW_HEIGHT = 104;

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
  // Units chosen for this order, keyed by product. Held separately from the
  // saved items because a row can have a unit before it has a quantity —
  // there is no order item to write to until the first "+" is pressed, and
  // the choice has to survive until then so it can be sent with the create.
  const [pendingUnits, setPendingUnits] = useState<Record<string, string>>({});
  const pendingUnitsRef = useRef<Record<string, string>>({});
  const [unitPickerProduct, setUnitPickerProduct] = useState<Product | null>(null);
  // Editing a product from here is rare; a pencil on every row is permanent
  // clutter on a screen whose job is setting quantities. Same toggle as the
  // departments list.
  const [isEditingProducts, setIsEditingProducts] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const orderCreationRef = useRef<Promise<Order> | null>(null);
  // What the user has chosen, ahead of the server agreeing. Rendering from
  // the server's copy meant the number sat still for a whole round-trip after
  // every tap, and two quick taps both read the same stale value so the
  // second was lost.
  const [pendingQuantities, setPendingQuantities] = useState<Record<string, number>>({});
  // Authoritative for the write path and updated synchronously. Syncing this
  // from render instead was the bug: a queued write starts the moment the
  // previous one resolves, which is before React has re-rendered, so it read
  // a stale map, failed to see the item just created, and created a second
  // one for the same product.
  const itemsByProductIdRef = useRef(itemsByProductId);

  // Mirrors applyItems: the write path reads this synchronously, before a
  // re-render has happened, so a ref rather than the state value.
  const applyUnits = (next: Record<string, string>) => {
    pendingUnitsRef.current = next;
    setPendingUnits(next);
  };

  /**
   * The unit this row is ordered in: the override chosen for this order, then
   * whatever the saved item holds, then the product's catalogue unit.
   */
  const unitFor = (product: Product): string =>
    pendingUnits[product.id] ?? itemsByProductId[product.id]?.unitType ?? product.unitType;

  const applyItems = (next: Record<string, OrderItem>) => {
    itemsByProductIdRef.current = next;
    setItemsByProductId(next);
  };
  const pendingQuantitiesRef = useRef(pendingQuantities);
  pendingQuantitiesRef.current = pendingQuantities;
  const listRef = useRef<FlatList<Product>>(null);
  // The product to scroll to and highlight. Seeded from the deep-link param
  // and re-set on every scan; the token makes rescanning the same product
  // scroll to it again after the user has scrolled away.
  const [scrollTarget, setScrollTarget] = useState<{ id: string; token: number } | null>(
    highlightProductId ? { id: highlightProductId, token: 0 } : null,
  );
  const handledScrollTokenRef = useRef<number | null>(null);
  const scrollAttemptsRef = useRef(0);
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
    if (!scrollTarget || !filteredProducts) return;
    if (handledScrollTokenRef.current === scrollTarget.token) return;
    const index = filteredProducts.findIndex((product) => product.id === scrollTarget.id);
    if (index === -1) return;
    scrollAttemptsRef.current = 0;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    handledScrollTokenRef.current = scrollTarget.token;
  }, [filteredProducts, scrollTarget]);

  useEffect(() => {
    const parsedSource: Order | null = sourceOrder ? JSON.parse(sourceOrder) : null;

    if (parsedSource?.status === 'DRAFT') {
      // Resume the existing draft as-is — no new order, reuse its items directly.
      setOrder(parsedSource);
      applyItems(
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
        applyItems(
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
            applyItems(
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

  // Performs the actual write for one product. Never called concurrently for
  // the same product, and only with the latest value the user chose.
  const writeQuantity = async (productId: string, quantity: number) => {
    const existing = itemsByProductIdRef.current[productId];
    if (quantity <= 0) {
      if (existing) {
        const currentOrder = await ensureOrder();
        await removeOrderItem(currentOrder.id, existing.id);
        const withoutItem = { ...itemsByProductIdRef.current };
        delete withoutItem[productId];
        applyItems(withoutItem);
      }
      return;
    }
    const currentOrder = await ensureOrder();
    if (existing) {
      const updated = await updateOrderItemQuantity(currentOrder.id, existing.id, quantity);
      applyItems({ ...itemsByProductIdRef.current, [productId]: updated });
    } else {
      const created = await addOrderItem(currentOrder.id, {
        productId,
        quantity,
        // Sent on create so a unit chosen before the first "+" is not lost;
        // the API falls back to the catalogue unit when this is undefined.
        unitType: pendingUnitsRef.current[productId],
      });
      applyItems({ ...itemsByProductIdRef.current, [productId]: created });
    }
  };

  const writeQuantityRef = useRef(writeQuantity);
  writeQuantityRef.current = writeQuantity;

  const quantityWriterRef = useRef<ReturnType<typeof createQuantityWriter> | null>(null);
  if (!quantityWriterRef.current) {
    quantityWriterRef.current = createQuantityWriter({
      delayMs: 400,
      write: (productId, quantity) => writeQuantityRef.current(productId, quantity),
      onError: (productId) => {
        // Drop back to whatever the server actually has, so the number on
        // screen is never a quantity that was not saved.
        setPendingQuantities((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
        showAlert({
          title: 'שגיאה',
          message: 'עדכון הכמות נכשל. יש לבדוק את החיבור ולנסות שוב.',
        });
      },
    });
  }

  const setQuantity = (product: Product, quantity: number) => {
    const next = Math.max(0, quantity);
    setPendingQuantities((prev) => ({ ...prev, [product.id]: next }));
    quantityWriterRef.current!.set(product.id, next);
  };

  // Steps relative to the newest value rather than the one captured when this
  // row last rendered. Two taps can land before React re-attaches the
  // handler, and reading the stale copy silently dropped the second.
  const adjustQuantity = (product: Product, direction: 1 | -1) => {
    const current =
      pendingQuantitiesRef.current[product.id] ??
      itemsByProductIdRef.current[product.id]?.quantity ??
      0;
    const step = quantityStep(
      pendingUnitsRef.current[product.id] ??
        itemsByProductIdRef.current[product.id]?.unitType ??
        product.unitType,
    );
    // Rounded because repeatedly adding 0.5 to a float drifts, and the column
    // only holds two decimals — 2.9999999 would be rejected outright.
    const next = Math.round((current + direction * step) * 100) / 100;
    setQuantity(product, next);
  };

  /**
   * Applies a unit change to this order's line for the product.
   *
   * Written straight through rather than through the debounced quantity
   * writer: a unit is picked once from a sheet, not tapped repeatedly, so
   * there is nothing to coalesce. If no item exists yet the choice is only
   * held locally — writeQuantity sends it when the line is created.
   */
  const changeUnit = async (product: Product, unitType: string) => {
    const previous = pendingUnitsRef.current;
    applyUnits({ ...previous, [product.id]: unitType });

    const existing = itemsByProductIdRef.current[product.id];
    // Nothing to write to until the row has a line. writeQuantity sends the
    // held choice when it creates one.
    if (!existing) return;

    try {
      // Through ensureOrder, like the quantity path: reading the `order`
      // state here would be a closure from the render this handler was built
      // in, which can predate the order's creation.
      const currentOrder = await ensureOrder();
      const updated = await updateOrderItemUnit(currentOrder.id, existing.id, unitType);
      applyItems({ ...itemsByProductIdRef.current, [product.id]: updated });
      // The server rounds a fraction away when the unit stops being a weight,
      // so the number on screen has to follow rather than keep showing a
      // quantity that was not saved.
      setPendingQuantities((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    } catch {
      applyUnits(previous);
      showAlert({
        title: 'שינוי יחידת המידה נכשל',
        message: 'לא ניתן היה לשמור את השינוי. יש לנסות שוב.',
      });
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
    // Deliberately does not change the quantity. Scanning identifies which
    // product the user means; how many they want is a separate decision, and
    // one is rarely the answer — so it scrolls there and lets them set it.
    //
    // Clear the filter first: a scanned product that the current search hides
    // is not in the list, so there would be nothing to scroll to.
    setSearch('');
    setScrollTarget({ id: match.id, token: Date.now() });
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
          placeholder="חפש מוצר"
          value={search}
          onChangeText={setSearch}
        />
        <Pressable onPress={() => setIsScannerVisible(true)} style={styles.scanButton}>
          <Text style={styles.scanButtonText}>סריקת ברקוד</Text>
        </Pressable>
        {role === 'ADMIN' && (
          <Pressable
            onPress={() => setIsEditingProducts((previous) => !previous)}
            accessibilityRole="button"
            accessibilityLabel={isEditingProducts ? 'סיום עריכת מוצרים' : 'עריכת מוצרים'}
            hitSlop={12}
            style={[styles.editToggle, isEditingProducts && styles.editToggleActive]}
          >
            <Text
              style={[
                styles.editToggleText,
                isEditingProducts && styles.editToggleTextActive,
              ]}
            >
              {isEditingProducts ? 'סיום' : 'עריכה'}
            </Text>
          </Pressable>
        )}
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
      {unitPickerProduct && (
        <UnitPickerSheet
          visible
          productName={unitPickerProduct.name}
          value={unitFor(unitPickerProduct)}
          onChange={(unitType) => changeUnit(unitPickerProduct, unitType)}
          onClose={() => setUnitPickerProduct(null)}
        />
      )}
      <FlatList
        ref={listRef}
        data={filteredProducts}
        keyExtractor={(product) => product.id}
        contentContainerStyle={styles.list}
        getItemLayout={(_data, index) => ({
          length: ROW_HEIGHT,
          offset: ROW_HEIGHT * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          // The row is outside the rendered window, so the list does not know
          // its offset. Jumping to an estimate forces it to render, and only
          // then can scrollToIndex place it accurately. Without the retry the
          // list landed on the estimate — which is nowhere near the row when
          // averageItemLength has not been measured yet, and exactly nowhere
          // when it is still 0.
          // Each attempt jumps to an estimate, which forces more rows to
          // render and so improves averageItemLength for the next one. Two or
          // three passes converge; the cap stops it looping forever if the
          // row can never be reached.
          if (scrollAttemptsRef.current >= 5) return;
          scrollAttemptsRef.current += 1;
          const rowHeight = ROW_HEIGHT;
          listRef.current?.scrollToOffset({ offset: rowHeight * info.index, animated: false });
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              animated: true,
              viewPosition: 0.5,
            });
          }, 250);
        }}
        renderItem={({ item: product }) => {
          const currentQuantity =
            pendingQuantities[product.id] ?? itemsByProductId[product.id]?.quantity ?? 0;
          const isHighlighted = product.id === scrollTarget?.id;
          const unit = unitFor(product);
          return (
            <View style={[styles.card, isHighlighted && styles.cardHighlighted]}>
              <View style={styles.productNameRow}>
                <Text style={styles.productName}>{product.name}</Text>
                {role === 'ADMIN' && isEditingProducts && (
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
                <Pressable
                  testID={`unit-${product.id}`}
                  style={styles.unitBadge}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`יחידת מידה: ${unit}. לשינוי`}
                  onPress={() => setUnitPickerProduct(product)}
                >
                  <Text testID={`unit-label-${product.id}`} style={styles.unitBadgeText}>
                    {unit}
                  </Text>
                  <Text style={styles.unitBadgeCaret}>▾</Text>
                </Pressable>
                <View style={styles.stepper}>
                  {/* RN mirrors flexDirection:'row' under RTL, so JSX order here is
                      reversed on purpose: this renders visually as [−] [qty] [+]. */}
                  <Pressable
                    testID={`increment-${product.id}`}
                    onPress={() => adjustQuantity(product, 1)}
                    style={styles.stepperButton}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </Pressable>
                  <TextInput
                    testID={`quantity-${product.id}`}
                    style={styles.quantityInput}
                    keyboardType={isWeightUnit(unit) ? 'decimal-pad' : 'number-pad'}
                    value={formatQuantity(currentQuantity)}
                    onChangeText={(text) => {
                      const parsed = Number(text.replace(',', '.'));
                      if (!Number.isFinite(parsed)) return;
                      setQuantity(
                        product,
                        isWeightUnit(unit) ? parsed : Math.trunc(parsed),
                      );
                    }}
                  />
                  <Pressable
                    testID={`decrement-${product.id}`}
                    onPress={() => adjustQuantity(product, -1)}
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
      {order && (
        <PublishButton
          order={order}
          items={Object.values(itemsByProductId)}
          onBeforeMarkPublished={() => quantityWriterRef.current!.flush()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  // A word rather than a pencil: the header already carries a pencil for
  // editing the provider, and two stacked pencils meant two different things
  // with the same icon.
  editToggle: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
  },
  editToggleActive: { backgroundColor: '#2563eb' },
  editToggleText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  editToggleTextActive: { color: '#fff' },
  search: {
    flex: 1,
    // Without a zero minimum a flex child refuses to shrink below its content,
    // which pushed the toolbar's last control off the edge of the screen.
    minWidth: 0,
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
    // Now a control rather than a label: the caret sits beside the text to
    // say so, and gap keeps them apart under RTL mirroring.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unitBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  unitBadgeCaret: { color: '#fff', fontSize: 11, marginTop: 1 },
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
