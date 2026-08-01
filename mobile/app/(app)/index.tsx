import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch } from '../../src/api/providers';
import { fetchProductsForBranch } from '../../src/api/products';
import { useBranch } from '../../src/branch/BranchContext';
import { BarcodeScannerModal } from '../../src/barcode/BarcodeScannerModal';
import { resolveBarcodeMatches, type BarcodeMatch } from '../../src/providers/resolveBarcodeMatches';

export default function HomeScreen() {
  const { selectedBranch } = useBranch();
  const [search, setSearch] = useState('');
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const { data: providers, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });
  const { data: branchProducts, error: branchProductsError } = useQuery({
    queryKey: ['branch-products', selectedBranch!.id],
    queryFn: () => fetchProductsForBranch(selectedBranch!.id),
  });

  const filteredProviders = useMemo(() => {
    if (!providers) return providers;
    const query = search.trim();
    if (!query) return providers;
    return providers.filter((provider) => provider.name.includes(query));
  }, [providers, search]);

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
      Alert.alert('שגיאה', 'לא ניתן לטעון את נתוני הספקים והמוצרים כרגע. יש לנסות שוב.');
      return;
    }
    const matches = resolveBarcodeMatches(providers ?? [], branchProducts ?? [], barcode);
    if (matches.length === 0) {
      Alert.alert('לא נמצא מוצר תואם', 'לא נמצא מוצר עם ברקוד זה אצל אף ספק בסניף.');
      return;
    }
    if (matches.length === 1) {
      navigateToMatch(matches[0]);
      return;
    }
    const visibleMatches = matches.slice(0, 2);
    const isTruncated = matches.length > visibleMatches.length;
    Alert.alert(
      'המוצר נמצא אצל כמה ספקים',
      isTruncated
        ? `לאיזה ספק לפתוח את ההזמנה? (מוצגים 2 מתוך ${matches.length} ספקים)`
        : 'לאיזה ספק לפתוח את ההזמנה?',
      [
        { text: 'ביטול', style: 'cancel' as const },
        ...visibleMatches.map((match) => ({
          text: match.providerName,
          onPress: () => navigateToMatch(match),
        })),
      ],
    );
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
        placeholder="חפש ספק…"
        value={search}
        onChangeText={setSearch}
      />

      {isLoading && <Text style={styles.statusText}>טוען ספקים…</Text>}
      {error && <Text style={styles.statusText}>לא ניתן לטעון ספקים. יש למשוך לרענון.</Text>}

      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={filteredProviders}
        keyExtractor={(provider) => provider.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: '/providers/[providerId]/order',
                params: { providerId: item.id, providerName: item.name },
              })
            }
          >
            <Text style={styles.cardText}>{item.name}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.statusText}>
              {search.trim() ? 'לא נמצאו ספקים תואמים לחיפוש.' : 'אין עדיין ספקים לסניף זה.'}
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
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardText: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
});
