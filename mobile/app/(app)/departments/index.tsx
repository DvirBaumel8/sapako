import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchDepartments } from '../../../src/api/departments';
import { useBranch } from '../../../src/branch/BranchContext';
import { useAuth } from '../../../src/auth/AuthContext';

export default function DepartmentsScreen() {
  const { selectedBranch } = useBranch();
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const { data: departments, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['departments', selectedBranch!.id],
    queryFn: () => fetchDepartments(selectedBranch!.id),
  });

  // Editing a department is rare, but a pencil on every row is permanent
  // clutter on a screen whose usual job is just picking one. One toggle at the
  // top reveals them when they are actually wanted.
  const [isEditing, setIsEditing] = useState(false);

  const visibleDepartments = isAdmin
    ? departments
    : departments?.filter((department) => department.isActive);

  return (
    <View style={styles.container}>
      {isAdmin && (
        <View style={styles.actionRow}>
          <Pressable onPress={() => router.push('/departments/new')} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ הוספת מחלקה</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsEditing((previous) => !previous)}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? 'סיום עריכה' : 'עריכת מחלקות'}
            hitSlop={12}
            style={[styles.editToggle, isEditing && styles.editToggleActive]}
          >
            <Text style={[styles.editToggleText, isEditing && styles.editToggleTextActive]}>
              {isEditing ? 'סיום' : '✎'}
            </Text>
          </Pressable>
        </View>
      )}
      {isLoading && <Text style={styles.statusText}>טוען מחלקות…</Text>}
      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={visibleDepartments}
        keyExtractor={(department) => department.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.row, !item.isActive && styles.rowInactive]}>
            <Pressable
              style={styles.rowMain}
              onPress={() =>
                router.push({
                  pathname: '/departments/[departmentId]/providers',
                  params: { departmentId: item.id, departmentName: item.name },
                })
              }
            >
              <Text style={styles.departmentName}>{item.name}</Text>
              {!item.isActive && <Text style={styles.inactiveLabel}>לא פעיל</Text>}
            </Pressable>
            {isAdmin && isEditing && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/departments/[departmentId]/edit',
                    params: {
                      departmentId: item.id,
                      departmentName: item.name,
                    },
                  })
                }
              >
                <Text style={styles.editIcon}>✎</Text>
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.statusText}>אין עדיין מחלקות לסניף זה.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
  },
  editToggle: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    minWidth: 52,
    alignItems: 'center',
  },
  editToggleActive: { backgroundColor: '#2563eb' },
  editToggleText: { color: '#2563eb', fontWeight: '600', fontSize: 16 },
  editToggleTextActive: { color: '#fff', fontSize: 14 },
  addButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  list: { gap: 8, paddingBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowInactive: { opacity: 0.5 },
  rowMain: { flex: 1 },
  departmentName: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
  inactiveLabel: { fontSize: 12, color: '#c0392b', textAlign: 'right', marginTop: 2 },
  editIcon: { fontSize: 20, color: '#2563eb', paddingHorizontal: 8 },
});
