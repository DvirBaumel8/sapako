import React from 'react';
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

  const visibleDepartments = isAdmin
    ? departments
    : departments?.filter((department) => department.isActive);

  return (
    <View style={styles.container}>
      {isAdmin && (
        <Pressable onPress={() => router.push('/departments/new')} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ הוספת מחלקה</Text>
        </Pressable>
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
            {isAdmin && (
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
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
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
