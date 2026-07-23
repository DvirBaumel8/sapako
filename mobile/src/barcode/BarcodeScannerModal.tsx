import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface BarcodeScannerModalProps {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({ visible, onScanned, onClose }: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!visible) {
    return null;
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
        onBarcodeScanned={(result) => {
          onScanned(result.data);
          onClose();
        }}
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
});
