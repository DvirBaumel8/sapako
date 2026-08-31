import { createBarcodeReader } from './createBarcodeReader';

describe('createBarcodeReader', () => {
  const makeFakeZxing = () => {
    const stop = jest.fn();
    let emit: (text: string) => void = () => {};
    const decodeFromVideoDevice = jest.fn(
      (_deviceId: string | undefined, _video: unknown, callback: (result: { getText: () => string } | undefined) => void) => {
        emit = (text) => callback({ getText: () => text });
        return Promise.resolve({ stop });
      },
    );
    return { controls: { decodeFromVideoDevice }, stop, emitScan: (text: string) => emit(text) };
  };

  it('forwards a decoded barcode to onScanned', async () => {
    const fake = makeFakeZxing();
    const onScanned = jest.fn();
    const reader = createBarcodeReader({ reader: fake.controls as never, onScanned });
    await reader.start({} as never);

    fake.emitScan('7290000066318');

    expect(onScanned).toHaveBeenCalledWith('7290000066318');
  });

  it('forwards only the first scan, even when many frames decode', async () => {
    // ZXing's callback fires once per decoded frame, not once per scan. With
    // a barcode held in view it fires many times before the modal closes.
    // Without this guard the same product is added repeatedly.
    const fake = makeFakeZxing();
    const onScanned = jest.fn();
    const reader = createBarcodeReader({ reader: fake.controls as never, onScanned });
    await reader.start({} as never);

    fake.emitScan('7290000066318');
    fake.emitScan('7290000066318');
    fake.emitScan('7290000066318');

    expect(onScanned).toHaveBeenCalledTimes(1);
  });

  it('stops the camera controls on stop()', async () => {
    // A leaked stream leaves the phone's camera indicator lit after the
    // modal closes.
    const fake = makeFakeZxing();
    const reader = createBarcodeReader({ reader: fake.controls as never, onScanned: jest.fn() });
    await reader.start({} as never);

    reader.stop();

    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the camera when stop() is called before start() resolves', async () => {
    // The widest window for this is while the OS permission prompt is up: the
    // user taps cancel, cleanup runs stop(), and only then does ZXing hand
    // back the controls. Nothing else holds a reference to them, so if start()
    // does not stop them here the stream stays live and the phone's camera
    // indicator stays lit after the scanner is gone.
    const stop = jest.fn();
    let resolveStart: (controls: { stop: () => void }) => void = () => {};
    const controls = {
      decodeFromVideoDevice: jest.fn(
        () => new Promise((resolve) => {
          resolveStart = resolve as (c: { stop: () => void }) => void;
        }),
      ),
    };
    const reader = createBarcodeReader({ reader: controls as never, onScanned: jest.fn() });

    const startPromise = reader.start({} as never);
    reader.stop();
    resolveStart({ stop });
    await startPromise;

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('tolerates stop() before start()', async () => {
    const fake = makeFakeZxing();
    const reader = createBarcodeReader({ reader: fake.controls as never, onScanned: jest.fn() });

    expect(() => reader.stop()).not.toThrow();
  });
});
