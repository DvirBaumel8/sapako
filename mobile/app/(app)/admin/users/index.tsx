import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../../../../src/api/users';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';

export default function UsersScreen() {
  useRequireAdmin();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.push('/admin/users/new')} style={styles.addButton}>
        <Text style={styles.addButtonText}>+ הוספת משתמש</Text>
      </Pressable>
      <FlatList
        data={users}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/admin/users/${item.id}/access`)}>
            <View>
              <Text style={styles.username}>{item.username}</Text>
              <Text style={styles.meta}>{item.role} · {item.providerAccess.length} ספקים</Text>
            </View>
            <Text style={styles.editIcon}>✎</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  addButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  username: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666' },
  editIcon: { fontSize: 20, color: '#2563eb' },
});
