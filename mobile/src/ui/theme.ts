/**
 * The values the app was already using in most places, named once.
 *
 * They were previously copied per screen, which is how six screens ended up
 * with a grey background and thirteen without, and how lists came to be white
 * cards in some places and hairline-separated rows in others.
 */
export const colors = {
  screen: '#f5f5f5',
  surface: '#ffffff',
  border: '#e0e0e0',
  inputBorder: '#ccc',
  text: '#1a1a1a',
  textMuted: '#666',
  accent: '#2563eb',
  accentSurface: '#eef2ff',
  danger: '#c0392b',
} as const;

export const radius = { card: 12, control: 10, input: 8 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16 } as const;
