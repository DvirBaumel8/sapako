import { OrderNotifierService } from './order-notifier.service';
import { Order } from '../orders/order.entity';

const order = {
  id: 'o1',
  provider: { name: 'תנובה', phone: '0501234567' },
  branch: { name: 'הילס' },
  publishedAt: new Date('2026-08-31T06:30:00.000Z'),
  items: [{ productNameSnapshot: 'חלב 3%', unitType: 'קרטון', quantity: 4 }],
} as Order;

describe('OrderNotifierService', () => {
  let service: OrderNotifierService;
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  const originalRecipient = process.env.ORDER_NOTIFICATION_EMAIL;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.RESEND_API_KEY = 'test-key';
    process.env.ORDER_NOTIFICATION_EMAIL = 'owner@example.com';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });
    service = new OrderNotifierService();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalKey;
    process.env.ORDER_NOTIFICATION_EMAIL = originalRecipient;
  });

  describe('when configured', () => {
    it('posts the email to Resend and reports that it sent', async () => {
      const sent = await service.sendOrderPublished(order);

      expect(sent).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('authenticates with the configured key', async () => {
      await service.sendOrderPublished(order);

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer test-key');
    });

    it('addresses the email to the configured recipient', async () => {
      await service.sendOrderPublished(order);

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body).to).toEqual(['owner@example.com']);
    });

    it('sends both an HTML and a plain-text body', async () => {
      // Plain text is what makes the record searchable in Gmail, and what
      // clients that refuse HTML fall back to.
      await service.sendOrderPublished(order);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.html).toContain('תנובה');
      expect(body.text).toContain('תנובה');
    });

    it('attaches an abort signal, so a hung Resend cannot stall the request', async () => {
      await service.sendOrderPublished(order);

      const [, init] = fetchMock.mock.calls[0];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('when Resend refuses', () => {
    it('throws, carrying the reason it gave', async () => {
      // A 403 alone is unactionable; Resend explains an unverified recipient
      // or a bad key only in the body.
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'recipient not verified',
      });

      await expect(service.sendOrderPublished(order)).rejects.toThrow(
        /403.*recipient not verified/,
      );
    });

    it('propagates a network failure rather than reporting success', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(service.sendOrderPublished(order)).rejects.toThrow(
        'network down',
      );
    });
  });

  describe('when not configured', () => {
    it.each([
      ['RESEND_API_KEY', 'ORDER_NOTIFICATION_EMAIL'],
      ['ORDER_NOTIFICATION_EMAIL', 'RESEND_API_KEY'],
    ])('no-ops when %s is missing', async (missing) => {
      // The normal state in CI and local development. A missing key must
      // never be the reason an order cannot be confirmed, and must never
      // cause a real email during a test run.
      delete process.env[missing];

      const sent = await service.sendOrderPublished(order);

      expect(sent).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
