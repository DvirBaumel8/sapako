import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';

export default function AdminHomeScreen() {
  return (
    <View style={styles.container}>
      <Link href="/admin/branches/new" style={styles.link}>הוספת סניף</Link>
      <Link href="/admin/providers/new" style={styles.link}>הוספת ספק</Link>
      <Link href="/admin/products/new" style={styles.link}>הוספת מוצר</Link>
      <Link href="/admin/users" style={styles.link}>ניהול משתמשים והרשאות</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  link: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
});
