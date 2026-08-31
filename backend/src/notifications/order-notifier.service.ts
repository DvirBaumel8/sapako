import { Injectable, Logger } from '@nestjs/common';
import { Order } from '../orders/order.entity';
import { buildOrderEmail } from './buildOrderEmail';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend's shared sender, which works without verifying a domain. Mail from
 * it can only be delivered to the address the Resend account was opened
 * with — which is exactly the case here, since the recipient is the owner.
 */
const FROM_ADDRESS = 'Sapako <onboarding@resend.dev>';

/** How long to wait before giving up, so a hung API cannot stall a request. */
const TIMEOUT_MS = 10_000;

/**
 * Emails a copy of each confirmed order to the shop owner.
 *
 * Called from the confirmation transition rather than the WhatsApp handoff:
 * opening WhatsApp proves nothing was sent, so notifying there would mean an
 * email for every order that was composed and then abandoned.
 *
 * Uses Resend's REST API over fetch rather than their SDK — it is one POST,
 * and this keeps a dependency (and its transitive tree) out of a service
 * that handles order data.
 */
@Injectable()
export class OrderNotifierService {
  private readonly logger = new Logger(OrderNotifierService.name);

  /**
   * Returns whether an email was actually sent, so the caller can record it.
   * False means "not configured", which is the normal state in tests and in
   * local development; a genuine failure throws.
   */
  async sendOrderPublished(order: Order): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    const recipient = process.env.ORDER_NOTIFICATION_EMAIL;

    // No-ops rather than throwing when unconfigured. CI and local runs have
    // neither variable, and a missing key must never be the reason an order
    // cannot be confirmed.
    if (!apiKey || !recipient) {
      this.logger.debug(
        'RESEND_API_KEY or ORDER_NOTIFICATION_EMAIL unset; skipping order email',
      );
      return false;
    }

    const { subject, html, text } = buildOrderEmail(order);
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [recipient],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // Body, not just status: Resend returns the reason (unverified
      // recipient, bad key) in it, and without that a 403 is unactionable.
      const body = await response.text().catch(() => '');
      throw new Error(
        `Resend rejected the order email: ${response.status} ${body}`.trim(),
      );
    }

    return true;
  }
}
