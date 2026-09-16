/**
 * @jest-environment jsdom
 */
import {
  beginWhatsAppAttempt,
  takePendingWhatsAppAttempt,
} from './whatsappAttempt';

describe('WhatsApp attempt tracking', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('keeps the latest launch attempt available until the user returns', () => {
    const attempt = beginWhatsAppAttempt('order-1');

    expect(attempt).toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        attemptId: expect.stringMatching(/^wa-/),
      }),
    );
    expect(takePendingWhatsAppAttempt()).toEqual(attempt);
    expect(takePendingWhatsAppAttempt()).toBeNull();
  });
});
