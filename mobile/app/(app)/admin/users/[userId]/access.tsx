import React, { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAccess,
  setBranchAccess,
  setDepartmentAccess,
  setProviderAccess,
  type AccessView,
} from '../../../../../src/api/access';
import { fetchAccessibleBranches } from '../../../../../src/api/branches';
import { useRequireAdmin } from '../../../../../src/auth/useRequireAdmin';
import type { Branch } from '../../../../../src/api/types';
import { useAlert } from '../../../../../src/ui/AlertProvider';
import { common } from '../../../../../src/ui/commonStyles';
import { colors, spacing } from '../../../../../src/ui/theme';

function reasonLine(provider: AccessView['providers'][number]): string | null {
  if (provider.reason === 'DEPARTMENT' && provider.viaDepartmentName) {
    return `דרך מחלקה: ${provider.viaDepartmentName}`;
  }
  if (provider.reason === 'BLOCKED' && provider.viaDepartmentName) {
    return `חסום למרות מחלקה: ${provider.viaDepartmentName}`;
  }
  return null;
}

export default function UserAccessScreen() {
  useRequireAdmin();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const showAlert = useAlert();
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  const activeBranch = selectedBranch ?? branches?.[0] ?? null;

  const accessQueryKey = ['access', userId, activeBranch?.id] as const;
  const { data: access, isLoading } = useQuery({
    queryKey: accessQueryKey,
    queryFn: () => fetchAccess(userId, activeBranch!.id),
    enabled: !!activeBranch,
  });

  const refetchAccess = () => queryClient.invalidateQueries({ queryKey: accessQueryKey });

  // The switch used to wait for the write AND the users list to refetch before
  // it moved — two round-trips of nothing happening, with no guard against
  // being tapped again in the meantime. It now flips immediately and reverts
  // if the write fails.
  const [pendingProviders, setPendingProviders] = useState<Record<string, boolean>>({});
  const providerInFlightRef = useRef<Set<string>>(new Set());

  const toggleProviderAccess = async (providerId: string, isCurrentlyGranted: boolean) => {
    if (providerInFlightRef.current.has(providerId)) return;
    providerInFlightRef.current.add(providerId);
    const next = !isCurrentlyGranted;
    setPendingProviders((prev) => ({ ...prev, [providerId]: next }));
    try {
      await setProviderAccess(userId, providerId, next);
      await refetchAccess();
      setPendingProviders((prev) => {
        const updated = { ...prev };
        delete updated[providerId];
        return updated;
      });
    } catch {
      setPendingProviders((prev) => {
        const updated = { ...prev };
        delete updated[providerId];
        return updated;
      });
      showAlert({
        title: 'שגיאה',
        message: 'עדכון ההרשאה נכשל. יש לבדוק את החיבור ולנסות שוב.',
      });
    } finally {
      providerInFlightRef.current.delete(providerId);
    }
  };

  // Department and branch writes touch many rows at once, so they await the
  // call and refetch instead of predicting the result locally.
  const [departmentPending, setDepartmentPending] = useState<Record<string, boolean>>({});
  const [branchPending, setBranchPending] = useState(false);

  const toggleDepartmentAccess = async (departmentId: string, isCurrentlyGranted: boolean) => {
    if (departmentPending[departmentId]) return;
    setDepartmentPending((prev) => ({ ...prev, [departmentId]: true }));
    try {
      await setDepartmentAccess(userId, departmentId, !isCurrentlyGranted);
      await refetchAccess();
    } catch {
      showAlert({
        title: 'שגיאה',
        message: 'עדכון ההרשאה למחלקה נכשל. יש לבדוק את החיבור ולנסות שוב.',
      });
    } finally {
      setDepartmentPending((prev) => {
        const updated = { ...prev };
        delete updated[departmentId];
        return updated;
      });
    }
  };

  const toggleBranchAccess = async (branchId: string, grantAll: boolean) => {
    if (branchPending) return;
    setBranchPending(true);
    try {
      await setBranchAccess(userId, branchId, grantAll);
      await refetchAccess();
    } catch {
      showAlert({
        title: 'שגיאה',
        message: 'עדכון ההרשאה לסניף נכשל. יש לבדוק את החיבור ולנסות שוב.',
      });
    } finally {
      setBranchPending(false);
    }
  };

  const isProviderGranted = (provider: AccessView['providers'][number]) =>
    pendingProviders[provider.id] ?? provider.isGranted;

  const allProvidersGranted =
    !!access && access.providers.length > 0 && access.providers.every((provider) => isProviderGranted(provider));

  return (
    <View style={common.screen}>
      <FlatList
        horizontal
        style={styles.branchList}
        contentContainerStyle={styles.branchListContent}
        data={branches}
        keyExtractor={(branch) => branch.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedBranch(item)}
            style={[common.chip, styles.branchChip, activeBranch?.id === item.id && styles.branchChipSelected]}
          >
            <Text style={[common.chipText, activeBranch?.id === item.id && styles.branchChipTextSelected]}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />
      {isLoading && <Text style={common.statusText}>טוען…</Text>}
      {activeBranch && access && (
        <FlatList
          data={access.providers}
          keyExtractor={(provider) => provider.id}
          contentContainerStyle={[common.list, styles.listContent]}
          style={styles.providerList}
          ListHeaderComponent={
            <View style={styles.headerSections}>
              <View style={common.cardRow}>
                <Text style={common.label}>הרשאה לכל הספקים בסניף</Text>
                <Switch
                  value={allProvidersGranted}
                  disabled={branchPending}
                  onValueChange={(next) => toggleBranchAccess(activeBranch.id, next)}
                />
              </View>

              <Text style={common.title}>מחלקות</Text>
              <View style={styles.section}>
                {access.departments.map((department) => (
                  <View key={department.id} style={common.cardRow}>
                    <Text style={common.label}>{department.name}</Text>
                    <Switch
                      value={department.isGranted}
                      disabled={!!departmentPending[department.id]}
                      onValueChange={() => toggleDepartmentAccess(department.id, department.isGranted)}
                    />
                  </View>
                ))}
              </View>

              <Text style={common.title}>ספקים</Text>
            </View>
          }
          renderItem={({ item: provider }) => {
            const line = reasonLine(provider);
            return (
              <View style={common.cardRow}>
                <View style={styles.providerTextColumn}>
                  <Text style={common.label}>{provider.name}</Text>
                  {line && <Text style={styles.reasonText}>{line}</Text>}
                </View>
                <Switch
                  value={isProviderGranted(provider)}
                  onValueChange={() => toggleProviderAccess(provider.id, isProviderGranted(provider))}
                />
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  branchList: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  branchListContent: { padding: spacing.md, gap: spacing.sm },
  branchChip: { marginRight: spacing.sm },
  branchChipSelected: { backgroundColor: colors.accent },
  branchChipTextSelected: { color: colors.surface },
  providerList: { flex: 1 },
  listContent: { paddingHorizontal: spacing.lg },
  headerSections: { gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.sm },
  section: { gap: spacing.sm },
  providerTextColumn: { flex: 1, gap: 2 },
  reasonText: { fontSize: 12, textAlign: 'right', color: colors.textMuted },
});
