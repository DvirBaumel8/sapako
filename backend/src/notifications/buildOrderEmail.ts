import { Order } from '../orders/order.entity';
import { formatQuantity } from '../products/unit-types';

export interface OrderEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TIME_ZONE = 'Asia/Jerusalem';

function formatSentAt(date: Date): string {
  // Rendered in the shop's own timezone rather than the server's. Render
  // runs in UTC, so without this the record would be stamped three hours
  // off and a morning order would read as having been sent before dawn.
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: TIME_ZONE,
  }).format(date);
}

/**
 * Builds the record email for an order the user confirmed sending.
 *
 * Kept apart from the transport so the wording is testable without a network
 * call, and so a Resend outage cannot be confused with a formatting bug.
 */
export function buildOrderEmail(order: Order): OrderEmail {
  const sentAt = formatSentAt(order.publishedAt ?? new Date());
  const subject = `הזמנה נשלחה — ${order.provider.name} — ${order.branch.name}`;

  const items = order.items ?? [];
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${escapeHtml(
          item.productNameSnapshot,
        )}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;white-space:nowrap">${escapeHtml(
          `${formatQuantity(item.quantity)} ${item.unitType}`,
        )}</td></tr>`,
    )
    .join('');

  const html = `<div dir="rtl" style="font-family:system-ui,Arial,sans-serif;color:#111">
  <h2 style="margin:0 0 4px">הזמנה נשלחה ל${escapeHtml(order.provider.name)}</h2>
  <p style="margin:0 0 16px;color:#555">
    סניף ${escapeHtml(order.branch.name)} · ${escapeHtml(sentAt)}<br>
    טלפון הספק: ${escapeHtml(order.provider.phone)}
  </p>
  <table style="border-collapse:collapse;min-width:280px">
    <thead><tr>
      <th align="right" style="padding:6px 12px;border-bottom:2px solid #111">מוצר</th>
      <th align="right" style="padding:6px 12px;border-bottom:2px solid #111">כמות</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin:16px 0 0;color:#555">סה"כ ${items.length} מוצרים</p>
</div>`;

  const text = [
    `הזמנה נשלחה ל${order.provider.name}`,
    `סניף ${order.branch.name} · ${sentAt}`,
    `טלפון הספק: ${order.provider.phone}`,
    '',
    ...items.map(
      (item) =>
        `${item.productNameSnapshot} — ${formatQuantity(item.quantity)} ${item.unitType}`,
    ),
    '',
    `סה"כ ${items.length} מוצרים`,
  ].join('\n');

  return { subject, html, text };
}
