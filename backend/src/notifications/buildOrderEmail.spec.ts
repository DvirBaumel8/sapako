import { buildOrderEmail } from './buildOrderEmail';
import { Order } from '../orders/order.entity';

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 'o1',
    provider: { name: 'תנובה', phone: '0501234567' },
    branch: { name: 'הילס' },
    publishedAt: new Date('2026-08-31T06:30:00.000Z'),
    items: [
      { productNameSnapshot: 'חלב 3%', unitType: 'קרטון', quantity: 4 },
      { productNameSnapshot: 'גבינה צהובה', unitType: 'ק"ג', quantity: 2.5 },
    ],
    ...overrides,
  }) as Order;

describe('buildOrderEmail', () => {
  it('names the provider and branch in the subject, so the inbox is scannable', () => {
    const { subject } = buildOrderEmail(order());

    expect(subject).toContain('תנובה');
    expect(subject).toContain('הילס');
  });

  it('lists every item with its quantity and unit', () => {
    const { text } = buildOrderEmail(order());

    expect(text).toContain('חלב 3% — 4 קרטון');
    expect(text).toContain('גבינה צהובה — 2.5 ק"ג');
  });

  it('drops the trailing zeros a numeric column returns', () => {
    // Postgres hands back "2.50"; an email reading "2.50 ק\"ג" looks like a
    // price, and the WhatsApp message the supplier got said "2.5".
    const { text } = buildOrderEmail(
      order({
        items: [
          { productNameSnapshot: 'גבינה', unitType: 'ק"ג', quantity: 2.5 },
        ],
      } as Partial<Order>),
    );

    expect(text).toContain('2.5 ק"ג');
    expect(text).not.toContain('2.50');
  });

  it('stamps the time in the shop’s timezone, not the server’s', () => {
    // Render runs in UTC. 06:30Z is 09:30 in Jerusalem, and a morning order
    // stamped 06:30 would read as having been placed before the shop opened.
    const { text } = buildOrderEmail(order());

    expect(text).toContain('9:30');
  });

  it('includes the provider phone, so the record is actionable on its own', () => {
    const { text } = buildOrderEmail(order());

    expect(text).toContain('0501234567');
  });

  it('counts the items', () => {
    const { text } = buildOrderEmail(order());

    expect(text).toContain('סה"כ 2 מוצרים');
  });

  it('escapes HTML in a product name rather than emitting it as markup', () => {
    // Product names are typed by hand, including from a barcode scan that
    // found nothing. An unescaped "<" would break the email body.
    const { html } = buildOrderEmail(
      order({
        items: [
          {
            productNameSnapshot: 'קרטון <b>גדול</b>',
            unitType: 'קרטון',
            quantity: 1,
          },
        ],
      } as Partial<Order>),
    );

    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>גדול</b>');
  });

  it('marks the body as RTL, so Hebrew renders correctly in the client', () => {
    const { html } = buildOrderEmail(order());

    expect(html).toContain('dir="rtl"');
  });

  it('handles an order with no items without throwing', () => {
    const { text } = buildOrderEmail(order({ items: [] }));

    expect(text).toContain('סה"כ 0 מוצרים');
  });
});
