import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../../../../src/api/users';

export default function UsersScreen() {
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  return (
    <View style={styles.container}>
      <Link href="/admin/users/new" style={styles.link}>+ הוספת משתמש</Link>
      <FlatList
        data={users}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/admin/users/${item.id}/access`)}>
            <Text style={styles.username}>{item.username}</Text>
            <Text style={styles.meta}>{item.role} · {item.providerAccess.length} ספקים</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  link: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  username: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666' },
});
