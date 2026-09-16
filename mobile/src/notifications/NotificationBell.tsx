import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchUnreadNotificationCount } from '../api/notifications';
import { useAuth } from '../auth/AuthContext';
import { UNREAD_COUNT_QUERY_KEY } from './queryKeys';

const MAX_DISPLAYED_COUNT = 9;

export function NotificationBell() {
  const { role } = useAuth();
  const { data: count } = useQuery({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: fetchUnreadNotificationCount,
    enabled: role === 'ADMIN',
  });

  if (role !== 'ADMIN') return null;

  const unread = count ?? 0;
  const label = unread > MAX_DISPLAYED_COUNT ? `${MAX_DISPLAYED_COUNT}+` : String(unread);

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      style={styles.button}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `התראות, ${unread} שלא נקראו` : 'התראות'}
    >
      <Text style={styles.bell}>🔔</Text>
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 12, paddingVertical: 4 },
  bell: { fontSize: 20 },
  badge: {
    position: 'absolute',
    top: -2,
    // Mirrors under RTL along with everything else in this app, so this
    // sits on the bell's upper-outer corner regardless of layout direction.
    left: -2,
    backgroundColor: '#dc2626',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
