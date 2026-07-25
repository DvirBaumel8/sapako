import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchUsers, grantProviderAccess, revokeProviderAccess } from '../../../../../src/api/users';
import { fetchAccessibleBranches } from '../../../../../src/api/branches';
import { fetchProvidersForBranch } from '../../../../../src/api/providers';
import type { Branch } from '../../../../../src/api/types';

export default function UserAccessScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const user = users?.find((candidate) => candidate.id === userId);
  const grantedProviderIds = new Set(user?.providerAccess.map((access) => access.providerId));

  const activeBranch = selectedBranch ?? branches?.[0] ?? null;

  const toggleAccess = async (providerId: string, isCurrentlyGranted: boolean) => {
    if (isCurrentlyGranted) {
      await revokeProviderAccess(userId, providerId);
    } else {
      await grantProviderAccess(userId, providerId);
    }
    queryClient.invalidateQueries({ queryKey: ['users'] });
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
          grantedProviderIds={grantedProviderIds}
          onToggle={toggleAccess}
        />
      )}
    </View>
  );
}

function ProviderToggles({
  branchId,
  grantedProviderIds,
  onToggle,
}: {
  branchId: string;
  grantedProviderIds: Set<string>;
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
            value={grantedProviderIds.has(provider.id)}
            onValueChange={() => onToggle(provider.id, grantedProviderIds.has(provider.id))}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  branchList: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#eee' },
  branchListContent: { padding: 12, gap: 8 },
  branchChip: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, marginRight: 8 },
  branchChipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  branchChipTextSelected: { color: '#fff', fontWeight: '600' },
  providerList: { padding: 16, gap: 4 },
  providerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  providerName: { fontSize: 15, textAlign: 'right', flex: 1 },
});
