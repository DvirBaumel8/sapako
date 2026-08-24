import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface BarcodeScannerModalProps {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

// Dev-build-only manual entry, for testing the scan flow on the Android
// emulator (which has no real camera to scan a barcode with — the emulator's
// webcam passthrough can be enabled for testing the camera UI itself, but
// this is what lets you exercise the actual matching logic afterward).
// __DEV__ is compiled away in production builds, so this never ships.
//
// This is rendered as its own full-screen mode rather than an overlay on
// top of CameraView: the camera preview is a native surface that (on
// Android in particular) can render above/steal touches from any RN view
// layered on top of it, which made an overlaid text input untappable.
// Keeping the two mutually exclusive avoids that entirely.
const DevManualBarcodeEntry = React.forwardRef<
  TextInput,
  { onScanned: (barcode: string) => void; onSwitchToCamera: () => void }
>(function DevManualBarcodeEntry({ onScanned, onSwitchToCamera }, ref) {
  const [value, setValue] = useState('');
  return (
    <View style={styles.devContainer}>
      <Text style={styles.devTitle}>בדיקה: הזנת ברקוד ידנית (dev בלבד)</Text>
      <TextInput
        ref={ref}
        style={styles.devEntryInput}
        placeholder="ברקוד"
        value={value}
        onChangeText={setValue}
        keyboardType="number-pad"
      />
      <Pressable style={styles.devEntryButton} disabled={!value} onPress={() => onScanned(value)}>
        <Text style={styles.devEntryButtonText}>סימולציה</Text>
      </Pressable>
      <Pressable style={styles.devSwitchButton} onPress={onSwitchToCamera}>
        <Text style={styles.devSwitchButtonText}>מעבר למצלמה האמיתית</Text>
      </Pressable>
    </View>
  );
});

export function BarcodeScannerModal({ visible, onScanned, onClose }: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [useManualEntry, setUseManualEntry] = useState(__DEV__);
  const devInputRef = useRef<TextInput>(null);
  // onBarcodeScanned fires once per detected frame, not once per scan — with a
  // barcode held in view it can fire many times before this modal finishes
  // closing. A ref (not state) guard is required here: state updates are
  // async, so a state-based guard would still let several frames through
  // before it takes effect, which is exactly the bug this prevents.
  const hasScannedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      hasScannedRef.current = false;
      setUseManualEntry(__DEV__);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const handleScanned = (barcode: string) => {
    if (hasScannedRef.current) {
      return;
    }
    hasScannedRef.current = true;
    onScanned(barcode);
    onClose();
  };

  if (__DEV__ && useManualEntry) {
    return (
      // autoFocus on the input isn't reliable here: on Android, a Modal's
      // native window frequently isn't fully attached yet at mount time, so
      // autoFocus fires "focused" in RN's own state (cursor blinks) without
      // ever reaching the OS to actually raise the keyboard, and it doesn't
      // recover on a later tap either. onShow fires once the modal's window
      // is truly up, which is the reliable time to request focus.
      <Modal visible transparent onShow={() => devInputRef.current?.focus()}>
        <View style={styles.centered}>
          <DevManualBarcodeEntry
            ref={devInputRef}
            onScanned={handleScanned}
            onSwitchToCamera={() => setUseManualEntry(false)}
          />
          <Pressable onPress={onClose} style={styles.button}>
            <Text>ביטול</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  if (!permission?.granted) {
    return (
      <Modal visible transparent>
        <View style={styles.centered}>
          <Text>נדרשת גישה למצלמה כדי לסרוק ברקודים.</Text>
          <Pressable onPress={requestPermission} style={styles.button}>
            <Text>אישור הרשאה</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.button}>
            <Text>ביטול</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={(result) => handleScanned(result.data)}
      />
      <Pressable onPress={onClose} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>ביטול</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: 'white' },
  camera: { flex: 1 },
  button: { padding: 12, borderWidth: 1, borderRadius: 8 },
  closeButton: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'white', padding: 12, borderRadius: 8 },
  closeButtonText: { fontWeight: '600' },
  devContainer: { width: '85%', gap: 10, alignItems: 'stretch' },
  devTitle: { textAlign: 'center', color: '#666', fontSize: 13 },
  devEntryInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
  devEntryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  devEntryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  devSwitchButton: { paddingVertical: 8, alignItems: 'center' },
  devSwitchButtonText: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
});
