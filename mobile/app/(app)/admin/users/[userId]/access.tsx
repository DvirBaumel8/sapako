import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAccess,
  setAllDepartmentsAccess,
  setBranchAccess,
  setDepartmentAccess,
  setProviderAccess,
  type AccessView,
} from '../../../../../src/api/access';
import { fetchUsers, updateUser } from '../../../../../src/api/users';
import { fetchAccessibleBranches } from '../../../../../src/api/branches';
import { useRequireAdmin } from '../../../../../src/auth/useRequireAdmin';
import type { Branch } from '../../../../../src/api/types';
import { useAlert } from '../../../../../src/ui/AlertProvider';
import { common } from '../../../../../src/ui/commonStyles';
import { colors, spacing } from '../../../../../src/ui/theme';
import { Toggle } from '../../../../../src/ui/Toggle';
import { fuzzySearch } from '../../../../../src/utils/fuzzySearch';

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
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const targetUser = users?.find((user) => user.id === userId);
  const [pendingCanEdit, setPendingCanEdit] = useState<boolean | null>(null);
  const canEditInFlightRef = useRef(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  // Both lists run to dozens of rows — 33 departments and 195 providers in the
  // live catalogue — so reaching one section means scrolling past the other.
  const [isDepartmentsOpen, setIsDepartmentsOpen] = useState(true);
  const [isProvidersOpen, setIsProvidersOpen] = useState(true);
  // Kept across branch switches on purpose.
  const [searchQuery, setSearchQuery] = useState('');

  const activeBranch = selectedBranch ?? branches?.[0] ?? null;

  const accessQueryKey = ['access', userId, activeBranch?.id] as const;
  const { data: access, isLoading } = useQuery({
    queryKey: accessQueryKey,
    queryFn: () => fetchAccess(userId, activeBranch!.id),
    enabled: !!activeBranch,
  });

  const toggleCanEditProducts = async (next: boolean) => {
    if (canEditInFlightRef.current) return;
    canEditInFlightRef.current = true;
    setPendingCanEdit(next);
    try {
      await updateUser(userId, { canEditProducts: next });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch {
      showAlert({ title: 'שגיאה', message: 'שמירת ההרשאה נכשלה. יש לנסות שוב.' });
    } finally {
      canEditInFlightRef.current = false;
      setPendingCanEdit(null);
    }
  };

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
  //
  // Each is guarded by a ref as well as the state that disables the switch.
  // The state copy is what a rendered closure captured, so two taps landing
  // before React re-renders both read false and both write — and the second
  // one also re-reads isCurrentlyGranted from the same stale render, so it
  // sends the value that was just sent rather than the opposite one.
  const [departmentPending, setDepartmentPending] = useState<Record<string, boolean>>({});
  const departmentInFlightRef = useRef<Set<string>>(new Set());
  const [branchPending, setBranchPending] = useState(false);
  const branchInFlightRef = useRef(false);

  const toggleDepartmentAccess = async (departmentId: string, isCurrentlyGranted: boolean) => {
    if (departmentInFlightRef.current.has(departmentId)) return;
    departmentInFlightRef.current.add(departmentId);
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
      departmentInFlightRef.current.delete(departmentId);
      setDepartmentPending((prev) => {
        const updated = { ...prev };
        delete updated[departmentId];
        return updated;
      });
    }
  };

  const [allDepartmentsPending, setAllDepartmentsPending] = useState(false);
  // Guarded by a ref as well as state, like providerInFlightRef above: two
  // quick taps can both land before React re-renders, and the state copy this
  // closure captured would still read false — so the second tap would fire a
  // second write over 33 departments.
  const allDepartmentsInFlightRef = useRef(false);

  const toggleAllDepartments = async (branchId: string, grantAll: boolean) => {
    if (allDepartmentsInFlightRef.current) return;
    allDepartmentsInFlightRef.current = true;
    setAllDepartmentsPending(true);
    try {
      await setAllDepartmentsAccess(userId, branchId, grantAll);
      await refetchAccess();
    } catch {
      showAlert({
        title: 'שגיאה',
        message: 'עדכון ההרשאה למחלקות נכשל. יש לבדוק את החיבור ולנסות שוב.',
      });
    } finally {
      allDepartmentsInFlightRef.current = false;
      setAllDepartmentsPending(false);
    }
  };

  const toggleBranchAccess = async (branchId: string, grantAll: boolean) => {
    if (branchInFlightRef.current) return;
    branchInFlightRef.current = true;
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
      branchInFlightRef.current = false;
      setBranchPending(false);
    }
  };

  const isProviderGranted = (provider: AccessView['providers'][number]) =>
    pendingProviders[provider.id] ?? provider.isGranted;

  const isSearching = searchQuery.trim().length > 0;
  const filteredDepartments = useMemo(
    () => fuzzySearch(access?.departments ?? [], searchQuery, (department) => department.name),
    [access?.departments, searchQuery],
  );
  const filteredProviders = useMemo(
    () => fuzzySearch(access?.providers ?? [], searchQuery, (provider) => provider.name),
    [access?.providers, searchQuery],
  );
  // Searching forces both sections open without touching the user's own
  // collapse state, so clearing the search puts things back as they were.
  const showDepartments = isSearching || isDepartmentsOpen;
  const showProviders = isSearching || isProvidersOpen;

  // The "all" toggles deliberately stay computed from the unfiltered lists.
  const allProvidersGranted =
    !!access && access.providers.length > 0 && access.providers.every((provider) => isProviderGranted(provider));

  const allDepartmentsGranted =
    !!access &&
    access.departments.length > 0 &&
    access.departments.every((department) => department.isGranted);

  return (
    <View style={common.screen}>
      {targetUser?.role === 'STAFF' && (
        <View style={[common.cardRow, styles.canEditRow]}>
          <Text style={common.label}>יכול לערוך מוצרים</Text>
          <Toggle
            accessibilityLabel="יכול לערוך מוצרים"
            value={pendingCanEdit ?? targetUser.canEditProducts}
            onValueChange={toggleCanEditProducts}
          />
        </View>
      )}
      {/* A row rather than a horizontal FlatList: react-native-web mirrors
          flexDirection under RTL, but a horizontal list keeps its own
          left-to-right scroll axis, which put the first branch on the left. */}
      <View style={styles.branchRow}>
        {branches?.map((branch) => {
          const isActive = activeBranch?.id === branch.id;
          return (
            <Pressable
              key={branch.id}
              onPress={() => setSelectedBranch(branch)}
              style={[common.chip, isActive && styles.branchChipSelected]}
            >
              <Text style={[common.chipText, isActive && styles.branchChipTextSelected]}>
                {branch.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="חיפוש ספק או מחלקה"
        accessibilityLabel="חיפוש ספק או מחלקה"
        style={styles.search}
      />
      {isLoading && <Text style={common.statusText}>טוען…</Text>}
      {activeBranch && access && (
        <FlatList
          data={showProviders ? filteredProviders : []}
          keyExtractor={(provider) => provider.id}
          contentContainerStyle={[common.list, styles.listContent]}
          style={styles.providerList}
          ListEmptyComponent={
            !showProviders ? null : isSearching ? (
              filteredDepartments.length === 0 ? (
                <Text style={common.statusText}>לא נמצאו תוצאות לחיפוש.</Text>
              ) : null
            ) : (
              <Text style={common.statusText}>אין ספקים בסניף הזה.</Text>
            )
          }
          ListHeaderComponent={
            <View style={styles.headerSections}>
              <View style={common.cardRow}>
                <Text style={common.label}>הרשאה לכל הספקים בסניף</Text>
                <Toggle
                  accessibilityLabel="הרשאה לכל הספקים בסניף"
                  value={allProvidersGranted}
                  disabled={branchPending}
                  onValueChange={(next) => toggleBranchAccess(activeBranch.id, next)}
                />
              </View>

              <Pressable
                onPress={() => setIsDepartmentsOpen((open) => !open)}
                style={styles.sectionHeader}
                accessibilityRole="button"
              >
                <Text style={common.title}>מחלקות ({filteredDepartments.length})</Text>
                <Text style={styles.sectionChevron}>{showDepartments ? '⌄' : '⌃'}</Text>
              </Pressable>
              <View style={styles.section}>
                {showDepartments && !isSearching && access.departments.length > 0 && (
                  <View style={[common.cardRow, styles.allDepartmentsRow]}>
                    <Text style={common.label}>הרשאה לכל המחלקות</Text>
                    <Toggle
                      accessibilityLabel="הרשאה לכל המחלקות"
                      value={allDepartmentsGranted}
                      disabled={allDepartmentsPending}
                      onValueChange={(next) => toggleAllDepartments(activeBranch.id, next)}
                    />
                  </View>
                )}
                {showDepartments && !isSearching && access.departments.length === 0 && (
                  <Text style={common.statusText}>אין מחלקות בסניף הזה.</Text>
                )}
                {showDepartments &&
                  filteredDepartments.map((department) => (
                  <View key={department.id} style={common.cardRow}>
                    <Text style={common.label}>{department.name}</Text>
                    <Toggle
                      accessibilityLabel={department.name}
                      value={department.isGranted}
                      disabled={!!departmentPending[department.id]}
                      onValueChange={() => toggleDepartmentAccess(department.id, department.isGranted)}
                    />
                  </View>
                  ))}
              </View>

              <Pressable
                onPress={() => setIsProvidersOpen((open) => !open)}
                style={styles.sectionHeader}
                accessibilityRole="button"
              >
                <Text style={common.title}>ספקים ({filteredProviders.length})</Text>
                <Text style={styles.sectionChevron}>{showProviders ? '⌄' : '⌃'}</Text>
              </Pressable>
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
                <Toggle
                  accessibilityLabel={provider.name}
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
  branchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  branchChipSelected: { backgroundColor: colors.accent },
  branchChipTextSelected: { color: colors.surface },
  canEditRow: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
  search: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'right',
    fontSize: 15,
  },
  providerList: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  sectionChevron: { fontSize: 18, color: colors.textMuted },
  listContent: { paddingHorizontal: spacing.lg },
  headerSections: { gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.sm },
  section: { gap: spacing.sm },
  // Tinted so it reads as the section's own control rather than the first
  // department in the list.
  allDepartmentsRow: { backgroundColor: colors.accentSurface },
  providerTextColumn: { flex: 1, gap: 2 },
  reasonText: { fontSize: 12, textAlign: 'right', color: colors.textMuted },
});
