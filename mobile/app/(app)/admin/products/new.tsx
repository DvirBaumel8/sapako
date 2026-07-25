import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../../../src/api/branches';
import { fetchProvidersForBranch } from '../../../../src/api/providers';
import { createProduct } from '../../../../src/api/products';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import type { Branch, Provider } from '../../../../src/api/types';

const DEFAULT_BRANCH_NAME = 'הילס';

export default function NewProductScreen() {
  useRequireAdmin();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());
  const [primaryBranch, setPrimaryBranch] = useState<Branch | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const [name, setName] = useState('');
  const [unitType, setUnitType] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isScannerVisible, setIsScannerVisible] = useState(false);

  useEffect(() => {
    if (!branches || selectedBranchIds.size > 0) return;
    const defaultBranch = branches.find((b) => b.name === DEFAULT_BRANCH_NAME) ?? branches[0];
    if (defaultBranch) {
      setSelectedBranchIds(new Set([defaultBranch.id]));
      setPrimaryBranch(defaultBranch);
    }
  }, [branches]);

  const { data: providers } = useQuery({
    queryKey: ['providers', primaryBranch?.id],
    queryFn: () => fetchProvidersForBranch(primaryBranch!.id),
    enabled: !!primaryBranch,
  });

  const filteredProviders = useMemo(() => {
    if (!providers) return providers;
    const query = providerSearch.trim();
    if (!query) return providers;
    return providers.filter((p) => p.name.includes(query));
  }, [providers, providerSearch]);

  const toggleBranch = (branch: Branch) => {
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branch.id)) {
        next.delete(branch.id);
      } else {
        next.add(branch.id);
      }
      return next;
    });
    if (!primaryBranch) {
      setPrimaryBranch(branch);
    }
  };

  const handleSubmit = async () => {
    if (!provider) return;
    const otherBranchIds = Array.from(selectedBranchIds).filter((id) => id !== primaryBranch?.id);
    const matchingProviderIds = await Promise.all(
      otherBranchIds.map(async (branchId) => {
        const branchProviders = await fetchProvidersForBranch(branchId);
        return branchProviders.find((p) => p.name === provider.name)?.id ?? null;
      }),
    );
    const targetProviderIds = [provider.id, ...matchingProviderIds.filter((id): id is string => !!id)];
    await Promise.all(
      targetProviderIds.map((providerId) =>
        createProduct(providerId, { name, unitType, barcode: barcode || undefined }),
      ),
    );
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>סניפים</Text>
      <FlatList
        horizontal
        style={styles.branchList}
        data={branches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggleBranch(item)}
            style={[styles.chip, selectedBranchIds.has(item.id) && styles.chipSelected]}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />

      {primaryBranch && !provider && (
        <View style={styles.providerSection}>
          <Text style={styles.label}>ספק (מתוך {primaryBranch.name})</Text>
          <TextInput
            style={styles.input}
            placeholder="חפש ספק…"
            value={providerSearch}
            onChangeText={setProviderSearch}
          />
          <FlatList
            style={styles.providerList}
            data={filteredProviders}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.providerRow} onPress={() => setProvider(item)}>
                <Text style={styles.providerRowText}>{item.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>לא נמצאו ספקים.</Text>}
          />
        </View>
      )}

      {provider && (
        <>
          <Pressable onPress={() => setProvider(null)} style={styles.selectedProvider}>
            <Text style={styles.selectedProviderText}>ספק: {provider.name} (החלף)</Text>
          </Pressable>
          {selectedBranchIds.size > 1 && (
            <Text style={styles.hintText}>
              המוצר ייווצר גם אצל ספקים בשם "{provider.name}" בסניפים הנוספים שנבחרו, אם קיימים.
            </Text>
          )}
          <TextInput style={styles.input} placeholder="שם המוצר" value={name} onChangeText={setName} />
          <TextInput
            style={styles.input}
            placeholder='סוג יחידה (לדוגמה: ק"ג, ארגז)'
            value={unitType}
            onChangeText={setUnitType}
          />
          <TextInput style={styles.input} placeholder="ברקוד (אופציונלי)" value={barcode} onChangeText={setBarcode} />
          <Pressable onPress={() => setIsScannerVisible(true)} style={styles.scanButton}>
            <Text>סריקת ברקוד</Text>
          </Pressable>
          <BarcodeScannerModal visible={isScannerVisible} onScanned={setBarcode} onClose={() => setIsScannerVisible(false)} />
          <PrimaryButton title="יצירת מוצר" onPress={handleSubmit} disabled={!name || !unitType} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  label: { fontWeight: '600' },
  branchList: { flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, marginRight: 8 },
  chipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  providerSection: { flex: 1, gap: 12 },
  providerList: { flex: 1, borderWidth: 1, borderColor: '#eee', borderRadius: 8 },
  providerRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  providerRowText: { fontSize: 15, textAlign: 'right' },
  emptyText: { padding: 12, textAlign: 'center', color: '#666' },
  selectedProvider: { backgroundColor: '#dbeafe', borderRadius: 8, padding: 12 },
  selectedProviderText: { color: '#2563eb', fontWeight: '600', textAlign: 'right' },
  hintText: { fontSize: 12, color: '#666', textAlign: 'right' },
  scanButton: { padding: 12, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
});
