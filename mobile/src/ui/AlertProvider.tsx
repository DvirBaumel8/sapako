import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { findCancelHandler } from './findCancelHandler';
import type { AlertButton, AlertOptions } from './alertTypes';

const DEFAULT_BUTTONS: AlertButton[] = [{ text: 'אישור' }];

interface AlertContextValue {
  showAlert: (options: AlertOptions) => void;
}

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<AlertOptions | null>(null);

  const showAlert = useCallback((options: AlertOptions) => {
    setCurrent(options);
  }, []);

  const buttons = current?.buttons?.length ? current.buttons : DEFAULT_BUTTONS;

  const dismiss = (onPress?: () => void) => {
    // Close first, then run the handler. Several handlers navigate away or
    // open another dialog, and leaving this one mounted while that happens
    // strands a modal on screen.
    setCurrent(null);
    onPress?.();
  };

  const value = useMemo(() => ({ showAlert }), [showAlert]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      <Modal
        visible={current !== null}
        transparent
        animationType="fade"
        onRequestClose={() => dismiss(findCancelHandler(current?.buttons))}
      >
        <Pressable
          testID="alert-backdrop"
          style={styles.backdrop}
          onPress={() => dismiss(findCancelHandler(current?.buttons))}
        >
          {/* Stops a tap inside the dialog from reaching the backdrop. */}
          <Pressable style={styles.dialog} onPress={() => {}}>
            <Text style={styles.title}>{current?.title}</Text>
            {current?.message ? <Text style={styles.message}>{current.message}</Text> : null}
            <View style={styles.buttonRow}>
              {/* Index in the key, not just the label: the provider-match
                  prompt builds its buttons from provider names, which are
                  not guaranteed distinct from each other or from 'ביטול'. */}
              {buttons.map((button, index) => (
                <Pressable
                  key={`${index}-${button.text}`}
                  style={styles.button}
                  onPress={() => dismiss(button.onPress)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      button.style === 'destructive' && styles.destructiveText,
                      button.style === 'cancel' && styles.cancelText,
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAlert(): AlertContextValue['showAlert'] {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context.showAlert;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    gap: 8,
  },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'right', color: '#1a1a1a' },
  message: { fontSize: 15, textAlign: 'right', color: '#444', lineHeight: 21 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-start', gap: 8, marginTop: 12 },
  button: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#2563eb' },
  destructiveText: { color: '#c0392b' },
  cancelText: { color: '#666' },
});
