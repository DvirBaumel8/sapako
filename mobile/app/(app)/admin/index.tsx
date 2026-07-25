import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router, Stack } from 'expo-router';

export default function AdminHomeScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.replace('/')} hitSlop={8}>
              <Text style={styles.backText}>‹ חזרה</Text>
            </Pressable>
          ),
        }}
      />
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
  backText: { fontSize: 16, color: '#2563eb' },
});
