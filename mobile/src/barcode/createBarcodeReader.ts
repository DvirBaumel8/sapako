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

export function createBarcodeReader({
  onScanned,
  reader,
}: CreateBarcodeReaderOptions): BarcodeReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
  const zxing = reader ?? new BrowserMultiFormatReader(hints);

  let controls: IScannerControls | null = null;
  // Not state: the decode callback fires once per frame, and a state update
  // would not have applied before the next frame arrives.
  let hasScanned = false;

  return {
    async start(video: HTMLVideoElement) {
      hasScanned = false;
      controls = await zxing.decodeFromVideoDevice(undefined, video, (result) => {
        if (!result || hasScanned) {
          return;
        }
        hasScanned = true;
        onScanned(result.getText());
      });
    },
    stop() {
      controls?.stop();
      controls = null;
    },
  };
}
