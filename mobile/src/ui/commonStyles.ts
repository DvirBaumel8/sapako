import { StyleSheet } from 'react-native';
import { colors, radius, spacing } from './theme';

/**
 * Shared building blocks so screens look like each other by default.
 * Screen-specific tweaks stay in the screen; these are the shapes that were
 * already being duplicated.
 */
export const common = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screen },
  screenPadded: { flex: 1, backgroundColor: colors.screen, padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  cardRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.input,
    padding: spacing.md,
    textAlign: 'right',
  },
  label: { fontWeight: '600', textAlign: 'right', color: colors.text },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: colors.text },
  muted: { color: colors.textMuted, textAlign: 'right' },
  statusText: { textAlign: 'center', marginTop: spacing.md, color: colors.textMuted },
  errorText: { color: colors.danger, fontSize: 13, textAlign: 'right' },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    backgroundColor: colors.accentSurface,
  },
  chipText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
});
