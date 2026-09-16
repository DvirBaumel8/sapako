import React, { useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProductsForProvider, updateProduct } from '../../../../../../src/api/products';
import { fetchCategoriesForProvider } from '../../../../../../src/api/categories';
import { useRequireAdmin } from '../../../../../../src/auth/useRequireAdmin';
import { useAlert } from '../../../../../../src/ui/AlertProvider';
import { Toggle } from '../../../../../../src/ui/Toggle';
import { common } from '../../../../../../src/ui/commonStyles';
import { colors, spacing } from '../../../../../../src/ui/theme';
import { fuzzySearch } from '../../../../../../src/utils/fuzzySearch';
import type { Product } from '../../../../../../src/api/types';

/**
 * Bulk-assigns a provider's products into one category via a toggle per
 * product, the same interaction already used for granting provider access
 * to a user — reassigning ~150+ products one at a time through the product
 * edit form would make setting up a new category impractical.
 *
 * A product can only be in one category, so switching a product on here
 * moves it here even if it already belonged to a different one — the row
 * shows which, so that's a visible choice, not a silent steal.
 */
export default function CategoryProductsScreen() {
  useRequireAdmin();
  const { providerId, categoryId, categoryName } = useLocalSearchParams<{
    providerId: string;
    categoryId: string;
    categoryName?: string;
  }>();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const [search, setSearch] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', providerId],
    queryFn: () => fetchProductsForProvider(providerId),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories', providerId],
    queryFn: () => fetchCategoriesForProvider(providerId),
  });
  const categoryNameById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category.name])),
    [categories],
  );

  const filteredProducts = useMemo(
    () => (products ? fuzzySearch(products, search, (product) => product.name) : products),
    [products, search],
  );

  // Mirrors the access screen's toggle: flips immediately, reverts on
  // failure, and a ref (not just the state the closure captured) guards
  // against a second tap landing before React re-renders from the first.
  const [pendingProductIds, setPendingProductIds] = useState<Record<string, boolean>>({});
  const inFlightRef = useRef<Set<string>>(new Set());

  const isInThisCategory = (product: Product) =>
    pendingProductIds[product.id] ?? product.categoryId === categoryId;

  const toggleProduct = async (product: Product) => {
    if (inFlightRef.current.has(product.id)) return;
    inFlightRef.current.add(product.id);
    const next = !isInThisCategory(product);
    setPendingProductIds((prev) => ({ ...prev, [product.id]: next }));
    try {
      await updateProduct(product.id, { categoryId: next ? categoryId : null });
      await queryClient.invalidateQueries({ queryKey: ['products', providerId] });
      setPendingProductIds((prev) => {
        const updated = { ...prev };
        delete updated[product.id];
        return updated;
      });
    } catch {
      setPendingProductIds((prev) => {
        const updated = { ...prev };
        delete updated[product.id];
        return updated;
      });
      showAlert({ title: 'שגיאה', message: 'עדכון הקטגוריה נכשל. יש לנסות שוב.' });
    } finally {
      inFlightRef.current.delete(product.id);
    }
  };

  return (
    <View style={common.screen}>
      <Stack.Screen options={{ title: categoryName ?? '' }} />
      <TextInput
        style={[common.input, styles.search]}
        placeholder="חפש מוצר"
        value={search}
        onChangeText={setSearch}
      />
      {isLoading && <Text style={common.statusText}>טוען מוצרים…</Text>}
      <FlatList
        data={filteredProducts}
        keyExtractor={(product) => product.id}
        contentContainerStyle={[common.list, styles.list]}
        renderItem={({ item: product }) => {
          const inCategory = isInThisCategory(product);
          const otherCategoryName =
            !inCategory && product.categoryId ? categoryNameById.get(product.categoryId) : undefined;
          return (
            <View style={common.cardRow}>
              <View style={styles.productTextColumn}>
                <Text style={common.label}>{product.name}</Text>
                {otherCategoryName && (
                  <Text style={styles.otherCategoryText}>כרגע תחת: {otherCategoryName}</Text>
                )}
              </View>
              <Toggle
                accessibilityLabel={product.name}
                value={inCategory}
                onValueChange={() => toggleProduct(product)}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          !isLoading ? <Text style={common.statusText}>לא נמצאו מוצרים תואמים לחיפוש.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  productTextColumn: { flex: 1, gap: 2 },
  otherCategoryText: { fontSize: 12, textAlign: 'right', color: colors.textMuted },
});
