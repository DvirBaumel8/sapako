import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { getToken } from '../auth/tokenStorage';
import { useAuth } from '../auth/AuthContext';
import { ADMIN_NOTIFICATIONS_QUERY_KEY, UNREAD_COUNT_QUERY_KEY } from './queryKeys';

/**
 * Live updates only while the app is open — this is a plain WebSocket, not
 * Web Push, so it delivers nothing while the tab/app isn't running. Renders
 * nothing; it exists purely to keep the bell's badge and the notifications
 * screen fresh without the admin having to pull-to-refresh.
 */
export function AdminNotificationsSocket() {
  const { role } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (role !== 'ADMIN') return;

    let socket: Socket | undefined;
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (cancelled || !token) return;
      socket = io(`${apiClient.defaults.baseURL}/admin-notifications`, {
        auth: { token },
        transports: ['websocket'],
      });
      socket.on('notification:new', () => {
        queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: ADMIN_NOTIFICATIONS_QUERY_KEY });
      });
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [role, queryClient]);

  return null;
}
