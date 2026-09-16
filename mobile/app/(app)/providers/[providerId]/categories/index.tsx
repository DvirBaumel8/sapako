import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchCategoriesForProvider } from '../../../../../src/api/categories';
import { useAuth } from '../../../../../src/auth/AuthContext';

export default function CategoriesScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const { data: categories, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['categories', providerId],
    queryFn: () => fetchCategoriesForProvider(providerId),
  });

  // Editing is rare relative to just browsing the list — same toggle
  // pattern as the departments screen, so a pencil isn't permanent clutter.
  const [isEditing, setIsEditing] = useState(false);

  return (
    <View style={styles.container}>
      {isAdmin && (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => router.push(`/providers/${providerId}/categories/new`)}
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>+ הוספת קטגוריה</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsEditing((previous) => !previous)}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? 'סיום עריכה' : 'עריכת קטגוריות'}
            hitSlop={12}
            style={[styles.editToggle, isEditing && styles.editToggleActive]}
          >
            <Text style={[styles.editToggleText, isEditing && styles.editToggleTextActive]}>
              {isEditing ? 'סיום' : '✎'}
            </Text>
          </Pressable>
        </View>
      )}
      {isLoading && <Text style={styles.statusText}>טוען קטגוריות…</Text>}
      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={categories}
        keyExtractor={(category) => category.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable
              style={styles.rowMain}
              onPress={() =>
                router.push({
                  pathname: '/providers/[providerId]/categories/[categoryId]/products',
                  params: { providerId, categoryId: item.id, categoryName: item.name },
                })
              }
            >
              <Text style={styles.categoryName}>{item.name}</Text>
            </Pressable>
            {isAdmin && isEditing && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/providers/[providerId]/categories/[categoryId]/edit',
                    params: { providerId, categoryId: item.id, categoryName: item.name },
                  })
                }
              >
                <Text style={styles.editIcon}>✎</Text>
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.statusText}>אין עדיין קטגוריות לספק זה.</Text> : null
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
  rowMain: { flex: 1 },
  categoryName: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
  editIcon: { fontSize: 20, color: '#2563eb', paddingHorizontal: 8 },
});
