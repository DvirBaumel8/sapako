import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteUser, fetchUsers } from '../../../../src/api/users';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { isConflictError } from '../../../../src/api/errors';
import { useAlert } from '../../../../src/ui/AlertProvider';

export default function UsersScreen() {
  useRequireAdmin();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  const removeUser = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => {
      if (isConflictError(err)) {
        showAlert({ title: 'לא ניתן למחוק', message: 'לא ניתן למחוק את המנהל האחרון במערכת.' });
      } else {
        showAlert({ title: 'שגיאה', message: 'מחיקת המשתמש נכשלה. יש לנסות שוב.' });
      }
    },
  });

  const confirmDelete = (userId: string, username: string) => {
    showAlert({
      title: 'מחיקת משתמש',
      message: `למחוק את המשתמש "${username}"? פעולה זו תמחק גם את כל היסטוריית ההזמנות שהוא יצר. לא ניתן לשחזר פעולה זו.`,
      buttons: [
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחיקה', style: 'destructive', onPress: () => removeUser.mutate(userId) },
      ],
    });
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.push('/admin/users/new')} style={styles.addButton}>
        <Text style={styles.addButtonText}>+ הוספת משתמש</Text>
      </Pressable>
      <FlatList
        data={users}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={styles.rowMain} onPress={() => router.push(`/admin/users/${item.id}/access`)}>
              <Text style={styles.username}>{item.username}</Text>
              <Text style={styles.meta}>{item.role} · {item.providerAccess.length} ספקים</Text>
            </Pressable>
            <Pressable style={styles.editButton} onPress={() => router.push(`/admin/users/${item.id}/access`)}>
              <Text style={styles.editIcon}>✎</Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              style={styles.deleteButton}
              onPress={() => confirmDelete(item.id, item.username)}
            >
              <Text style={styles.deleteIcon}>🗑</Text>
            </Pressable>
          </View>
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
  rowMain: { flex: 1 },
  username: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666' },
  editButton: { paddingHorizontal: 8 },
  editIcon: { fontSize: 20, color: '#2563eb' },
  deleteButton: { paddingHorizontal: 8 },
  deleteIcon: { fontSize: 17 },
});
