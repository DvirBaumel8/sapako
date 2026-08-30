import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createBarcodeReader } from './createBarcodeReader';

interface BarcodeScannerModalProps {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

type Status = 'starting' | 'scanning' | 'denied' | 'unavailable';

// Manual entry, for exercising the scan flow where no usable camera exists:
// a desktop browser, or a device that denied permission. Previously
// __DEV__-only; a browser build has more legitimate no-camera cases, so it is
// now reachable whenever the camera cannot be used.
function ManualBarcodeEntry({
  onScanned,
  onRetryCamera,
}: {
  onScanned: (barcode: string) => void;
  onRetryCamera: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <View style={styles.devContainer}>
      <Text style={styles.devTitle}>הזנת ברקוד ידנית</Text>
      <TextInput
        style={styles.devEntryInput}
        placeholder="ברקוד"
        value={value}
        onChangeText={setValue}
        keyboardType="number-pad"
        autoFocus
      />
      <Pressable
        style={styles.devEntryButton}
        disabled={!value}
        onPress={() => onScanned(value)}
      >
        <Text style={styles.devEntryButtonText}>אישור</Text>
      </Pressable>
      <Pressable style={styles.devSwitchButton} onPress={onRetryCamera}>
        <Text style={styles.devSwitchButtonText}>מעבר למצלמה</Text>
      </Pressable>
    </View>
  );
}

export function BarcodeScannerModal({ visible, onScanned, onClose }: BarcodeScannerModalProps) {
  const [status, setStatus] = useState<Status>('starting');
  const [useManualEntry, setUseManualEntry] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<ReturnType<typeof createBarcodeReader> | null>(null);

  useEffect(() => {
    if (!visible || useManualEntry) {
      return;
    }
    let cancelled = false;
    setStatus('starting');

    const reader = createBarcodeReader({
      onScanned: (barcode) => {
        reader.stop();
        onScanned(barcode);
        onClose();
      },
    });
    readerRef.current = reader;

    (async () => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      try {
        await reader.start(video);
        if (!cancelled) {
          setStatus('scanning');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        // NotAllowedError is a denied permission prompt; anything else
        // (no camera, insecure context) is not something the user can grant.
        const name = (error as { name?: string })?.name;
        setStatus(name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    })();

    return () => {
      cancelled = true;
      // Must run on every close, or the phone's camera indicator stays lit.
      reader.stop();
      readerRef.current = null;
    };
  }, [visible, useManualEntry, onScanned, onClose]);

  useEffect(() => {
    if (visible) {
      setUseManualEntry(false);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  if (useManualEntry) {
    return (
      <Modal visible transparent>
        <View style={styles.centered}>
          <ManualBarcodeEntry
            onScanned={(barcode) => {
              onScanned(barcode);
              onClose();
            }}
            onRetryCamera={() => setUseManualEntry(false)}
          />
          <Pressable onPress={onClose} style={styles.button}>
            <Text>ביטול</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  if (status === 'denied' || status === 'unavailable') {
    return (
      <Modal visible transparent>
        <View style={styles.centered}>
          <Text style={styles.statusText}>
            {status === 'denied'
              ? 'נדרשת גישה למצלמה כדי לסרוק ברקודים. יש לאשר את ההרשאה בהגדרות הדפדפן.'
              : 'לא נמצאה מצלמה זמינה במכשיר זה.'}
          </Text>
          <Pressable onPress={() => setUseManualEntry(true)} style={styles.button}>
            <Text>הזנת ברקוד ידנית</Text>
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
      <View style={styles.cameraContainer}>
        {/* playsInline and muted are both required for inline playback in
            iOS Safari — without them the video takes over the whole screen
            in the native player and the decoder never sees a frame. */}
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          playsInline
          muted
          autoPlay
        />
        {status === 'starting' ? (
          <Text style={styles.startingText}>מפעיל את המצלמה…</Text>
        ) : null}
      </View>
      <Pressable onPress={() => setUseManualEntry(true)} style={styles.manualButton}>
        <Text style={styles.closeButtonText}>הזנה ידנית</Text>
      </Pressable>
      <Pressable onPress={onClose} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>ביטול</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'white',
    padding: 24,
  },
  statusText: { textAlign: 'center', fontSize: 15, color: '#444', lineHeight: 21 },
  cameraContainer: { flex: 1, backgroundColor: 'black' },
  startingText: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    color: 'white',
    fontSize: 15,
  },
  button: { padding: 12, borderWidth: 1, borderRadius: 8 },
  closeButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
  },
  manualButton: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
  },
  closeButtonText: { fontWeight: '600' },
  devContainer: { width: '85%', gap: 10, alignItems: 'stretch' },
  devTitle: { textAlign: 'center', color: '#666', fontSize: 13 },
  devEntryInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  devEntryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  devEntryButtonText: { color: 'white', fontWeight: '600' },
  devSwitchButton: { paddingVertical: 10, alignItems: 'center' },
  devSwitchButtonText: { color: '#2563eb', fontWeight: '600' },
});
