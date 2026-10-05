import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { updateProductNote } from '../api/products';
import type { Product } from '../api/types';
import { colors, radius, spacing } from '../ui/theme';

export const NOTE_MAX_LENGTH = 200;

interface ProductNoteDialogProps {
  product: Product;
  onSaved: (updated: Product, outcome: 'saved' | 'deleted') => void;
  onClose: () => void;
}

/**
 * Adds, edits or deletes a product's internal note.
 *
 * Same centered-card shape as UnitPickerSheet so the order screen's dialogs
 * read as one family. On failure the dialog stays open with the text intact:
 * a note is typed on a phone in a busy shop, and losing it to a dropped
 * connection would mean typing it again.
 */
export function ProductNoteDialog({ product, onSaved, onClose }: ProductNoteDialogProps) {
  const [text, setText] = useState(product.note ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref as well as state: two taps in the same frame both read the stale
  // state value, and the second would send a duplicate request.
  const isSavingRef = useRef(false);
  const hasExistingNote = !!product.note?.trim();

  const submit = async (note: string | null) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateProductNote(product.providerId, product.id, note);
      onSaved(updated, updated.note ? 'saved' : 'deleted');
    } catch {
      isSavingRef.current = false;
      setIsSaving(false);
      setError('ההערה לא נשמרה. בדקו את החיבור ונסו שוב.');
    }
  };

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed && !hasExistingNote) {
      // Nothing to save and nothing to delete.
      onClose();
      return;
    }
    void submit(trimmed || null);
  };

  const close = () => {
    if (!isSavingRef.current) onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable testID="note-backdrop" style={styles.backdrop} onPress={close} accessibilityLabel="סגירה">
        {/* Stops a tap inside the dialog from reaching the backdrop and closing it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>הערה למוצר</Text>
          <Text style={styles.subtitle}>{product.name}</Text>
          <TextInput
            testID="note-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="למשל: להזמין רק ביום ראשון"
            // Light enough not to be mistaken for a note that's already there.
            placeholderTextColor="#b8bcc4"
            maxLength={NOTE_MAX_LENGTH}
            multiline
            autoFocus
            textAlignVertical="top"
            editable={!isSaving}
          />
          <Text testID="note-counter" style={styles.counter}>
            {`${text.length}/${NOTE_MAX_LENGTH}`}
          </Text>
          {error ? (
            <Text testID="note-error" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <Pressable
              testID="note-save"
              style={[styles.button, styles.primaryButton, isSaving && styles.buttonDisabled]}
              onPress={save}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>שמירה</Text>
            </Pressable>
            <Pressable
              testID="note-cancel"
              style={[styles.button, styles.secondaryButton]}
              onPress={close}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>ביטול</Text>
            </Pressable>
          </View>
          {hasExistingNote && (
            <Pressable
              testID="note-delete"
              onPress={() => void submit(null)}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.deleteText}>מחיקת ההערה</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    // Pinned near the top, not centered: the input autofocuses, and on a
    // phone the keyboard covered the Save button of a centered dialog.
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'right' },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'right' },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    padding: spacing.md,
    minHeight: 80,
    fontSize: 15,
    textAlign: 'right',
    color: colors.text,
  },
  counter: { fontSize: 12, color: colors.textMuted, textAlign: 'left' },
  error: { fontSize: 13, color: colors.danger, textAlign: 'right' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  button: { flex: 1, alignItems: 'center', borderRadius: radius.control, paddingVertical: 12 },
  primaryButton: { backgroundColor: colors.accent },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryButton: { backgroundColor: '#f3f4f6' },
  secondaryButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  deleteText: { color: colors.danger, fontSize: 14, textAlign: 'center', paddingTop: spacing.xs },
});
