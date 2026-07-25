import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../../../src/api/branches';
import { fetchProvidersForBranch } from '../../../../src/api/providers';
import { createProduct } from '../../../../src/api/products';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import type { Branch, Provider } from '../../../../src/api/types';

export default function NewProductScreen() {
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [branch, setBranch] = useState<Branch | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const [name, setName] = useState('');
  const [unitType, setUnitType] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isScannerVisible, setIsScannerVisible] = useState(false);

  const { data: providers } = useQuery({
    queryKey: ['providers', branch?.id],
    queryFn: () => fetchProvidersForBranch(branch!.id),
    enabled: !!branch,
  });

  const filteredProviders = useMemo(() => {
    if (!providers) return providers;
    const query = providerSearch.trim();
    if (!query) return providers;
    return providers.filter((p) => p.name.includes(query));
  }, [providers, providerSearch]);

  const handleSubmit = async () => {
    if (!provider) return;
    await createProduct(provider.id, { name, unitType, barcode: barcode || undefined });
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>סניף</Text>
      <FlatList
        horizontal
        style={styles.branchList}
        data={branches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setBranch(item);
              setProvider(null);
            }}
            style={[styles.chip, branch?.id === item.id && styles.chipSelected]}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />

      {branch && !provider && (
        <>
          <Text style={styles.label}>ספק</Text>
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
        </>
      )}

      {provider && (
        <>
          <Pressable onPress={() => setProvider(null)} style={styles.selectedProvider}>
            <Text style={styles.selectedProviderText}>ספק: {provider.name} (החלף)</Text>
          </Pressable>
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
  providerList: { maxHeight: 260, borderWidth: 1, borderColor: '#eee', borderRadius: 8 },
  providerRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  providerRowText: { fontSize: 15, textAlign: 'right' },
  emptyText: { padding: 12, textAlign: 'center', color: '#666' },
  selectedProvider: { backgroundColor: '#dbeafe', borderRadius: 8, padding: 12 },
  selectedProviderText: { color: '#2563eb', fontWeight: '600', textAlign: 'right' },
  scanButton: { padding: 12, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
});
