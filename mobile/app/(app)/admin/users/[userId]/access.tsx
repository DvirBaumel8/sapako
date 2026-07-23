import React from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchUsers, grantProviderAccess, revokeProviderAccess } from '../../../../../src/api/users';
import { fetchAccessibleBranches } from '../../../../../src/api/branches';
import { fetchProvidersForBranch } from '../../../../../src/api/providers';

export default function UserAccessScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const user = users?.find((candidate) => candidate.id === userId);
  const grantedProviderIds = new Set(user?.providerAccess.map((access) => access.providerId));

  const toggleAccess = async (providerId: string, isCurrentlyGranted: boolean) => {
    if (isCurrentlyGranted) {
      await revokeProviderAccess(userId, providerId);
    } else {
      await grantProviderAccess(userId, providerId);
    }
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={branches}
      keyExtractor={(branch) => branch.id}
      renderItem={({ item: branch }) => <BranchProviderToggles branchId={branch.id} branchName={branch.name} grantedProviderIds={grantedProviderIds} onToggle={toggleAccess} />}
    />
  );
}

function BranchProviderToggles({
  branchId,
  branchName,
  grantedProviderIds,
  onToggle,
}: {
  branchId: string;
  branchName: string;
  grantedProviderIds: Set<string>;
  onToggle: (providerId: string, isCurrentlyGranted: boolean) => void;
}) {
  const { data: providers } = useQuery({
    queryKey: ['providers', branchId],
    queryFn: () => fetchProvidersForBranch(branchId),
  });

  return (
    <View style={styles.branchSection}>
      <Text style={styles.branchName}>{branchName}</Text>
      {providers?.map((provider) => (
        <View key={provider.id} style={styles.providerRow}>
          <Text>{provider.name}</Text>
          <Switch
            value={grantedProviderIds.has(provider.id)}
            onValueChange={() => onToggle(provider.id, grantedProviderIds.has(provider.id))}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  branchSection: { gap: 8 },
  branchName: { fontSize: 16, fontWeight: '700' },
  providerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
});
