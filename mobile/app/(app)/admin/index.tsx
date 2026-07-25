import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useRequireAdmin } from '../../../src/auth/useRequireAdmin';

const LINKS = [
  { href: '/admin/branches/new', label: 'הוספת סניף' },
  { href: '/admin/providers/new', label: 'הוספת ספק' },
  { href: '/admin/products/new', label: 'הוספת מוצר' },
  { href: '/admin/users', label: 'ניהול משתמשים והרשאות' },
] as const;

export default function AdminHomeScreen() {
  useRequireAdmin();
  return (
    <View style={styles.container}>
      {LINKS.map((item) => (
        <Pressable key={item.href} style={styles.card} onPress={() => router.push(item.href)}>
          <Text style={styles.cardText}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: '#f5f5f5' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', textAlign: 'right' },
});
