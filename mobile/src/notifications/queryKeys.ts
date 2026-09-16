// Shared between the bell, the socket listener, and the notifications
// screen so a query key typo in one place can't silently desync them.
export const UNREAD_COUNT_QUERY_KEY = ['adminNotifications', 'unreadCount'] as const;
export const ADMIN_NOTIFICATIONS_QUERY_KEY = ['adminNotifications', 'list'] as const;
