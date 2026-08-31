interface QuantityWriterOptions {
  /** How long to wait for further changes before sending. */
  delayMs: number;
  /** Performs the actual write. Never called concurrently for one product. */
  write: (productId: string, quantity: number) => Promise<void>;
  /** Called with the product whose write failed, so the UI can correct itself. */
  onError: (productId: string) => void;
}

export interface QuantityWriter {
  /** Record the quantity the user has chosen. Returns immediately. */
  set: (productId: string, quantity: number) => void;
  /** Send anything pending now and wait for all in-flight writes to finish. */
  flush: () => Promise<void>;
}

/**
 * Coalesces quantity changes per product and sends them one at a time.
 *
 * Tapping "+" five times used to be five sequential round-trips, each one
 * blocking the number on screen from moving until it returned. Over a slow
 * link that is seconds of a frozen UI, and because each tap read the quantity
 * from state that had not updated yet, two quick taps both sent the same
 * value and the second was lost.
 *
 * The caller updates its own state immediately and leaves the network to
 * this: only the final value is sent, and writes for a given product never
 * overlap, so the server cannot end up holding whichever response happened to
 * land last.
 */
export function createQuantityWriter({
  delayMs,
  write,
  onError,
}: QuantityWriterOptions): QuantityWriter {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, number>();
  const inFlight = new Map<string, Promise<void>>();

  const send = (productId: string): Promise<void> => {
    const quantity = pending.get(productId);
    if (quantity === undefined) {
      return inFlight.get(productId) ?? Promise.resolve();
    }
    pending.delete(productId);

    // Chain onto any write still running for this product rather than racing
    // it, then record the chain so flush() can wait for the whole sequence.
    const previous = inFlight.get(productId) ?? Promise.resolve();
    const next = previous
      .then(() => write(productId, quantity))
      .catch(() => onError(productId))
      .finally(() => {
        if (inFlight.get(productId) === next) {
          inFlight.delete(productId);
        }
      });
    inFlight.set(productId, next);
    return next;
  };

  return {
    set(productId, quantity) {
      pending.set(productId, quantity);
      const existing = timers.get(productId);
      if (existing) {
        clearTimeout(existing);
      }
      timers.set(
        productId,
        setTimeout(() => {
          timers.delete(productId);
          void send(productId);
        }, delayMs),
      );
    },

    async flush() {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();

      const ids = new Set([...pending.keys(), ...inFlight.keys()]);
      await Promise.all([...ids].map((id) => send(id)));

      // A write can be queued behind another while we were waiting, so keep
      // draining until nothing is left.
      if (pending.size > 0 || inFlight.size > 0) {
        await this.flush();
      }
    },
  };
}
