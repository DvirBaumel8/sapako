import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch } from '../../src/api/providers';
import { fetchProductsForBranch } from '../../src/api/products';
import { useBranch } from '../../src/branch/BranchContext';
import { BarcodeScannerModal } from '../../src/barcode/BarcodeScannerModal';
import { resolveBarcodeMatches, type BarcodeMatch } from '../../src/providers/resolveBarcodeMatches';
import { buildProviderSearchResults } from '../../src/providers/buildProviderSearchResults';
import { useAlert } from '../../src/ui/AlertProvider';
import { useAuth } from '../../src/auth/AuthContext';

export default function HomeScreen() {
  const { selectedBranch } = useBranch();
  const { role } = useAuth();
  const showAlert = useAlert();
  const [search, setSearch] = useState('');
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [collapsedProviderIds, setCollapsedProviderIds] = useState<Set<string>>(new Set());
  const { data: providers, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });
  // Every product in the branch, needed only for searching by product name
  // and for matching a scanned barcode. It is by far the largest payload the
  // app fetches, so it is left until one of those two things is happening
  // rather than downloaded on every visit to this screen.
  const needsProducts = search.trim().length > 0 || isScannerVisible;
  const {
    data: branchProducts,
    error: branchProductsError,
    isLoading: isLoadingProducts,
  } = useQuery({
    queryKey: ['branch-products', selectedBranch!.id],
    queryFn: () => fetchProductsForBranch(selectedBranch!.id),
    enabled: needsProducts,
  });

  const searchResults = useMemo(
    () => buildProviderSearchResults(providers ?? [], branchProducts ?? [], search),
    [providers, branchProducts, search],
  );

  const toggleCollapsed = (providerId: string) => {
    setCollapsedProviderIds((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const navigateToMatch = (match: BarcodeMatch) => {
    router.push({
      pathname: '/providers/[providerId]/order',
      params: {
        providerId: match.providerId,
        providerName: match.providerName,
        highlightProductId: match.productId,
      },
    });
  };

  const handleBarcodeScanned = (barcode: string) => {
    if (error || branchProductsError) {
      showAlert({ title: 'שגיאה', message: 'לא ניתן לטעון את נתוני הספקים והמוצרים כרגע. יש לנסות שוב.' });
      return;
    }
    if (!branchProducts) {
      // The catalogue is still on its way. Saying "no matching product" here
      // would be a lie that sends the user to add one that already exists.
      showAlert({
        title: 'רשימת המוצרים עדיין נטענת',
        message: 'יש להמתין רגע ולסרוק שוב.',
      });
      return;
    }
    const matches = resolveBarcodeMatches(providers ?? [], branchProducts, barcode);
    if (matches.length === 0) {
      if (role !== 'ADMIN') {
        showAlert({
          title: 'לא נמצא מוצר תואם',
          message: 'לא נמצא מוצר עם ברקוד זה אצל אף ספק בסניף.',
        });
        return;
      }
      // Unlike the order screen, there is no provider in context here — the
      // scan searched the whole branch — so this hands off to the add-product
      // screen, where a provider is chosen, with the barcode carried across.
      showAlert({
        title: 'לא נמצא מוצר תואם',
        message: `לא נמצא מוצר עם ברקוד ${barcode} אצל אף ספק בסניף. להוסיף אותו כמוצר חדש?`,
        buttons: [
          { text: 'ביטול', style: 'cancel' },
          {
            text: 'הוספת מוצר חדש',
            onPress: () =>
              router.push({ pathname: '/admin/products/new', params: { barcode } }),
          },
        ],
      });
      return;
    }
    if (matches.length === 1) {
      navigateToMatch(matches[0]);
      return;
    }
    const visibleMatches = matches.slice(0, 2);
    const isTruncated = matches.length > visibleMatches.length;
    showAlert({
      title: 'המוצר נמצא אצל כמה ספקים',
      message: isTruncated
        ? `לאיזה ספק לפתוח את ההזמנה? (מוצגים 2 מתוך ${matches.length} ספקים)`
        : 'לאיזה ספק לפתוח את ההזמנה?',
      buttons: [
        { text: 'ביטול', style: 'cancel' as const },
        ...visibleMatches.map((match) => ({
          text: match.providerName,
          onPress: () => navigateToMatch(match),
        })),
      ],
    });
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.push('/select-branch')} style={styles.branchRow}>
        <Text style={styles.branchName}>{selectedBranch!.name} ▾</Text>
      </Pressable>
      <View style={styles.secondaryButtonRow}>
        <Pressable onPress={() => router.push('/activity')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>פעילות אחרונה</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/departments')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>מחלקות</Text>
        </Pressable>
        <Pressable onPress={() => setIsScannerVisible(true)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>סריקת ברקוד</Text>
        </Pressable>
      </View>
      <BarcodeScannerModal
        visible={isScannerVisible}
        onScanned={handleBarcodeScanned}
        onClose={() => setIsScannerVisible(false)}
      />

      <TextInput
        style={styles.search}
        placeholder="חפש ספק, מוצר או ברקוד"
        value={search}
        onChangeText={setSearch}
      />

      {isLoading && <Text style={styles.statusText}>טוען ספקים…</Text>}
      {/* Without this, typing a product name shows an empty result while the
          catalogue is still downloading — indistinguishable from "no such
          product". */}
      {isLoadingProducts && search.trim().length > 0 && (
        <Text style={styles.statusText}>מחפש גם במוצרים…</Text>
      )}
      {error && <Text style={styles.statusText}>לא ניתן לטעון ספקים. יש למשוך לרענון.</Text>}

      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={searchResults}
        keyExtractor={(result) => result.provider.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isCollapsed = collapsedProviderIds.has(item.provider.id);
          const hasProducts = item.matchingProducts.length > 0;
          return (
            <View style={styles.card}>
              <View style={styles.providerRow}>
                <Pressable
                  style={styles.providerNamePressable}
                  onPress={() =>
                    router.push({
                      pathname: '/providers/[providerId]/order',
                      params: { providerId: item.provider.id, providerName: item.provider.name },
                    })
                  }
                >
                  <Text style={styles.cardText}>{item.provider.name}</Text>
                </Pressable>
                {hasProducts && (
                  <Pressable
                    style={styles.collapseToggle}
                    onPress={() => toggleCollapsed(item.provider.id)}
                    hitSlop={8}
                  >
                    <Text style={styles.collapseToggleText}>{isCollapsed ? '▸' : '▾'}</Text>
                  </Pressable>
                )}
              </View>
              {!isCollapsed &&
                item.matchingProducts.map((product, index) => (
                  <Pressable
                    key={product.id}
                    style={[
                      styles.productRow,
                      index === 0 ? styles.firstProductRow : styles.subsequentProductRow,
                      index === item.matchingProducts.length - 1 && styles.lastProductRow,
                    ]}
                    onPress={() =>
                      router.push({
                        pathname: '/providers/[providerId]/order',
                        params: {
                          providerId: item.provider.id,
                          providerName: item.provider.name,
                          highlightProductId: product.id,
                        },
                      })
                    }
                  >
                    <Text style={styles.productRowText}>{product.name}</Text>
                  </Pressable>
                ))}
            </View>
          );
        }}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.statusText}>
              {search.trim()
                ? 'לא נמצאו ספקים או מוצרים תואמים לחיפוש.'
                : 'אין עדיין ספקים לסניף זה.'}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 16 },
  branchRow: { paddingHorizontal: 16, marginBottom: 8 },
  branchName: { fontSize: 20, fontWeight: '700' },
  secondaryButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  secondaryButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'right',
    fontSize: 15,
  },
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardText: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
  providerRow: {
    width: '100%',
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  providerNamePressable: { flex: 1 },
  collapseToggle: { paddingHorizontal: 8, paddingVertical: 4 },
  collapseToggleText: { fontSize: 16, color: '#666' },
  productRow: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  firstProductRow: { paddingTop: 0 },
  subsequentProductRow: { marginTop: 8 },
  lastProductRow: { paddingBottom: 16 },
  productRowText: { fontSize: 14, textAlign: 'right', color: '#2563eb' },
});
