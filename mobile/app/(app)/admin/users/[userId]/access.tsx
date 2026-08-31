import React, { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchUsers, grantProviderAccess, revokeProviderAccess } from '../../../../../src/api/users';
import { fetchAccessibleBranches } from '../../../../../src/api/branches';
import { fetchProvidersForBranch } from '../../../../../src/api/providers';
import { useRequireAdmin } from '../../../../../src/auth/useRequireAdmin';
import type { Branch } from '../../../../../src/api/types';
import { useAlert } from '../../../../../src/ui/AlertProvider';

export default function UserAccessScreen() {
  useRequireAdmin();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const showAlert = useAlert();
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const user = users?.find((candidate) => candidate.id === userId);
  const grantedProviderIds = new Set(user?.providerAccess.map((access) => access.providerId));

  const activeBranch = selectedBranch ?? branches?.[0] ?? null;

  // The switch used to wait for the write AND the users list to refetch before
  // it moved — two round-trips of nothing happening, with no guard against
  // being tapped again in the meantime. It now flips immediately and reverts
  // if the write fails.
  const [pendingAccess, setPendingAccess] = useState<Record<string, boolean>>({});
  const inFlightRef = useRef<Set<string>>(new Set());

  const toggleAccess = async (providerId: string, isCurrentlyGranted: boolean) => {
    if (inFlightRef.current.has(providerId)) return;
    inFlightRef.current.add(providerId);
    const next = !isCurrentlyGranted;
    setPendingAccess((prev) => ({ ...prev, [providerId]: next }));
    try {
      if (isCurrentlyGranted) {
        await revokeProviderAccess(userId, providerId);
      } else {
        await grantProviderAccess(userId, providerId);
      }
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setPendingAccess((prev) => {
        const updated = { ...prev };
        delete updated[providerId];
        return updated;
      });
    } catch {
      setPendingAccess((prev) => {
        const updated = { ...prev };
        delete updated[providerId];
        return updated;
      });
      showAlert({
        title: 'שגיאה',
        message: 'עדכון ההרשאה נכשל. יש לבדוק את החיבור ולנסות שוב.',
      });
    } finally {
      inFlightRef.current.delete(providerId);
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        horizontal
        style={styles.branchList}
        contentContainerStyle={styles.branchListContent}
        data={branches}
        keyExtractor={(branch) => branch.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedBranch(item)}
            style={[styles.branchChip, activeBranch?.id === item.id && styles.branchChipSelected]}
          >
            <Text style={activeBranch?.id === item.id && styles.branchChipTextSelected}>{item.name}</Text>
          </Pressable>
        )}
      />
      {activeBranch && (
        <ProviderToggles
          branchId={activeBranch.id}
          isGranted={(providerId) =>
            pendingAccess[providerId] ?? grantedProviderIds.has(providerId)
          }
          onToggle={toggleAccess}
        />
      )}
    </View>
  );
}

function ProviderToggles({
  branchId,
  isGranted,
  onToggle,
}: {
  branchId: string;
  isGranted: (providerId: string) => boolean;
  onToggle: (providerId: string, isCurrentlyGranted: boolean) => void;
}) {
  const { data: providers } = useQuery({
    queryKey: ['providers', branchId],
    queryFn: () => fetchProvidersForBranch(branchId),
  });

  return (
    <FlatList
      contentContainerStyle={styles.providerList}
      data={providers}
      keyExtractor={(provider) => provider.id}
      renderItem={({ item: provider }) => (
        <View style={styles.providerRow}>
          <Text style={styles.providerName}>{provider.name}</Text>
          <Switch
            value={isGranted(provider.id)}
            onValueChange={() => onToggle(provider.id, isGranted(provider.id))}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5' },
  branchList: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#eee' },
  branchListContent: { padding: 12, gap: 8 },
  branchChip: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, marginRight: 8 },
  branchChipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  branchChipTextSelected: { color: '#fff', fontWeight: '600' },
  providerList: { padding: 16, gap: 8, paddingBottom: 24 },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  providerName: { fontSize: 15, textAlign: 'right', flex: 1 },
});
