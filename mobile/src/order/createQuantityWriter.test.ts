import { createQuantityWriter } from './createQuantityWriter';

// Real timers are faked in these tests, so a setTimeout-based flush would
// never fire. Draining the microtask queue is what is actually needed.
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

describe('createQuantityWriter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends one write with the final value when tapped repeatedly', async () => {
    // The whole point: five taps on "+" over a slow link must not be five
    // round-trips, and must not race each other.
    const write = jest.fn().mockResolvedValue(undefined);
    const writer = createQuantityWriter({ delayMs: 300, write, onError: jest.fn() });

    writer.set('p1', 1);
    writer.set('p1', 2);
    writer.set('p1', 3);
    expect(write).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    await flushMicrotasks();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('p1', 3);
  });

  it('keeps products independent', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const writer = createQuantityWriter({ delayMs: 300, write, onError: jest.fn() });

    writer.set('p1', 1);
    writer.set('p2', 7);
    jest.advanceTimersByTime(300);
    await flushMicrotasks();

    expect(write.mock.calls.sort()).toEqual([
      ['p1', 1],
      ['p2', 7],
    ]);
  });

  it('never overlaps two writes for the same product', async () => {
    // Out-of-order completion would leave the server holding whichever
    // response happened to land last, not the value the user chose.
    let inFlight = 0;
    let maxConcurrent = 0;
    const write = jest.fn(async () => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    });
    const writer = createQuantityWriter({ delayMs: 100, write, onError: jest.fn() });

    writer.set('p1', 1);
    jest.advanceTimersByTime(100);
    writer.set('p1', 2);
    jest.advanceTimersByTime(100);
    await writer.flush();

    expect(maxConcurrent).toBe(1);
  });

  it('flush() waits for pending work and sends it immediately', async () => {
    // Publishing must not race a quantity the user just typed.
    const write = jest.fn().mockResolvedValue(undefined);
    const writer = createQuantityWriter({ delayMs: 5000, write, onError: jest.fn() });

    writer.set('p1', 4);
    await writer.flush();

    expect(write).toHaveBeenCalledWith('p1', 4);
  });

  it('flush() resolves when there is nothing pending', async () => {
    const writer = createQuantityWriter({
      delayMs: 300,
      write: jest.fn(),
      onError: jest.fn(),
    });
    await expect(writer.flush()).resolves.toBeUndefined();
  });

  it('reports the product whose write failed', async () => {
    const onError = jest.fn();
    const write = jest.fn().mockRejectedValue(new Error('offline'));
    const writer = createQuantityWriter({ delayMs: 100, write, onError });

    writer.set('p1', 2);
    await writer.flush();

    expect(onError).toHaveBeenCalledWith('p1');
  });

  it('keeps working after a failure', async () => {
    const onError = jest.fn();
    const write = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const writer = createQuantityWriter({ delayMs: 100, write, onError });

    writer.set('p1', 1);
    await writer.flush();
    writer.set('p1', 2);
    await writer.flush();

    expect(write).toHaveBeenLastCalledWith('p1', 2);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
