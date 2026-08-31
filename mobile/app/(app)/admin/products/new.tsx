import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../../../src/api/branches';
import { fetchProvidersForBranch } from '../../../../src/api/providers';
import { createProduct } from '../../../../src/api/products';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';
import { fuzzySearch } from '../../../../src/utils/fuzzySearch';
import type { Branch, Provider } from '../../../../src/api/types';
import { useAlert } from '../../../../src/ui/AlertProvider';
import { UnitTypePicker } from '../../../../src/products/UnitTypePicker';
import { DEFAULT_UNIT_TYPE } from '../../../../src/products/unitTypes';

const DEFAULT_BRANCH_NAME = 'הילס';

export default function NewProductScreen() {
  useRequireAdmin();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());
  // Guards against a second submit while the first is still in flight: on a
  // slow connection the button looks inert, so it gets tapped again and the
  // record is created twice.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [primaryBranch, setPrimaryBranch] = useState<Branch | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const [name, setName] = useState('');
  const [unitType, setUnitType] = useState<string>(DEFAULT_UNIT_TYPE);
  const [barcode, setBarcode] = useState('');
  const [isScannerVisible, setIsScannerVisible] = useState(false);

  useEffect(() => {
    if (!branches || primaryBranch) return;
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

  // Once a provider is chosen, only branches that actually have a
  // same-named provider are valid additional targets — showing every
  // branch here would silently promise something that can't happen.
  const { data: matchingBranchIds } = useQuery({
    queryKey: ['matching-provider-branches', provider?.name, primaryBranch?.id],
    queryFn: async () => {
      const others = (branches ?? []).filter((b) => b.id !== primaryBranch?.id);
      const results = await Promise.all(
        others.map(async (b) => {
          const branchProviders = await fetchProvidersForBranch(b.id);
          return branchProviders.some((p) => p.name === provider!.name) ? b.id : null;
        }),
      );
      return new Set(results.filter((id): id is string => !!id));
    },
    enabled: !!provider && !!branches,
  });

  useEffect(() => {
    if (!provider || !matchingBranchIds || !primaryBranch) return;
    setSelectedBranchIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => id === primaryBranch.id || matchingBranchIds.has(id)));
      return next;
    });
  }, [provider, matchingBranchIds, primaryBranch]);

  const selectableBranches = useMemo(() => {
    if (!branches) return branches;
    if (!provider) return branches;
    return branches.filter((b) => b.id === primaryBranch?.id || matchingBranchIds?.has(b.id));
  }, [branches, provider, primaryBranch, matchingBranchIds]);

  const filteredProviders = useMemo(() => {
    if (!providers) return providers;
    return fuzzySearch(providers, providerSearch, (p) => p.name);
  }, [providers, providerSearch]);

  const toggleBranch = (branch: Branch) => {
    const turningOn = !selectedBranchIds.has(branch.id);
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (turningOn) {
        next.add(branch.id);
      } else {
        next.delete(branch.id);
      }
      return next;
    });
    if (turningOn) {
      setPrimaryBranch(branch);
    } else if (primaryBranch?.id === branch.id) {
      const fallback = Array.from(selectedBranchIds).find((id) => id !== branch.id);
      setPrimaryBranch(branches?.find((b) => b.id === fallback) ?? null);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting || !provider) return;
    setIsSubmitting(true);
    try {
      const otherBranchIds = Array.from(selectedBranchIds).filter((id) => id !== primaryBranch?.id);
      const matchingProviderIds = await Promise.all(
        otherBranchIds.map(async (branchId) => {
          const branchProviders = await fetchProvidersForBranch(branchId);
          return branchProviders.find((p) => p.name === provider.name)?.id ?? null;
        }),
      );
      const targetProviderIds = [
        provider.id,
        ...matchingProviderIds.filter((id): id is string => !!id),
      ];
      await Promise.all(
        targetProviderIds.map((providerId) =>
          createProduct(providerId, { name, unitType, barcode: barcode || undefined }),
        ),
      );
      // Refresh the lists this product belongs to before returning to them.
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['branch-products'] });
      router.back();
    } catch {
      // Previously unhandled: a failed create left the screen silently doing
      // nothing, which on a slow connection is indistinguishable from the app
      // having ignored the tap.
      showAlert({ title: 'שגיאה', message: 'יצירת המוצר נכשלה. יש לנסות שוב.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>סניפים</Text>
      <FlatList
        horizontal
        style={styles.branchList}
        data={selectableBranches}
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
          <Text style={styles.label}>
            ספק (רשימה מתוך {primaryBranch.name}
            {selectedBranchIds.size > 1
              ? ` — נבחרו גם: ${(branches ?? [])
                  .filter((b) => selectedBranchIds.has(b.id) && b.id !== primaryBranch.id)
                  .map((b) => b.name)
                  .join(', ')}`
              : ''}
            )
          </Text>
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
          <View style={styles.selectedProviderRow}>
            <Text style={styles.selectedProviderText}>ספק: {provider.name}</Text>
            <Pressable onPress={() => setProvider(null)} style={styles.changeButton}>
              <Text style={styles.changeButtonText}>‹ בחירת ספק אחר</Text>
            </Pressable>
          </View>
          {selectedBranchIds.size > 1 && (
            <Text style={styles.hintText}>
              המוצר ייווצר גם אצל ספקים בשם "{provider.name}" בסניפים הנוספים שנבחרו.
            </Text>
          )}
          <TextInput
            style={styles.input}
            placeholder="שם המוצר"
            value={name}
            onChangeText={(text) => setName(sanitizeHebrewInput(text))}
          />
          <Text style={styles.label}>יחידת מידה</Text>
          <UnitTypePicker value={unitType} onChange={setUnitType} />
          <TextInput style={styles.input} placeholder="ברקוד (אופציונלי)" value={barcode} onChangeText={setBarcode} />
          <Pressable onPress={() => setIsScannerVisible(true)} style={styles.scanButton}>
            <Text>סריקת ברקוד</Text>
          </Pressable>
          <BarcodeScannerModal visible={isScannerVisible} onScanned={setBarcode} onClose={() => setIsScannerVisible(false)} />
          <PrimaryButton title="יצירת מוצר" onPress={handleSubmit} disabled={!name || !unitType || isSubmitting} />
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
  selectedProviderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    padding: 12,
  },
  selectedProviderText: { color: '#1a1a1a', fontWeight: '600', textAlign: 'right' },
  changeButton: { paddingHorizontal: 4 },
  changeButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  hintText: { fontSize: 12, color: '#666', textAlign: 'right' },
  scanButton: { padding: 12, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
});
