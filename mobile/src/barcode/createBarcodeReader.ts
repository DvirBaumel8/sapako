import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface CreateBarcodeReaderOptions {
  onScanned: (barcode: string) => void;
  // Injectable so the scan-once guard and teardown can be tested without a
  // real camera.
  reader?: BrowserMultiFormatReader;
}

export interface BarcodeReader {
  start: (video: HTMLVideoElement) => Promise<void>;
  stop: () => void;
}

// The same formats the native scanner was configured for. Restricting the
// set makes decoding faster and avoids false positives from formats that
// never appear on grocery packaging.
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

// Ask for a usable resolution explicitly. Left to its own devices iOS hands
// back 640x480, at which the bars of a barcode held at arm's length do not
// survive downscaling and nothing ever decodes — the preview looks perfect
// while the scanner sits there doing nothing.
const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  audio: false,
};

export function createBarcodeReader({
  onScanned,
  reader,
}: CreateBarcodeReaderOptions): BarcodeReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
  // Spend more effort per frame, including trying rotated orientations. The
  // camera is handheld over a shelf, so the barcode is rarely square-on.
  hints.set(DecodeHintType.TRY_HARDER, true);
  const zxing = reader ?? new BrowserMultiFormatReader(hints);

  let controls: IScannerControls | null = null;
  // Not state: the decode callback fires once per frame, and a state update
  // would not have applied before the next frame arrives.
  let hasScanned = false;
  // start() is async, so stop() can land while getUserMedia and ZXing are
  // still negotiating — most often when the user dismisses the scanner with
  // the OS permission prompt still up. Without this flag that stop() is a
  // no-op (controls is still null), and the controls that arrive afterwards
  // are never stopped by anyone: the stream stays live and the phone's
  // camera indicator stays lit after the scanner is gone.
  let stopped = false;

  return {
    async start(video: HTMLVideoElement) {
      hasScanned = false;
      stopped = false;
      const started = await zxing.decodeFromConstraints(CONSTRAINTS, video, (result) => {
        if (!result || hasScanned) {
          return;
        }
        hasScanned = true;
        onScanned(result.getText());
      });
      if (stopped) {
        started.stop();
        return;
      }
      controls = started;
    },
    stop() {
      stopped = true;
      controls?.stop();
      controls = null;
    },
  };
}
