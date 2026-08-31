export enum OrderStatus {
  DRAFT = 'DRAFT',
  /**
   * Handed off to WhatsApp, but nobody has established the message was
   * actually sent.
   *
   * wa.me is a one-way link — it returns nothing and offers no receipt — so
   * opening it is the last thing the app can observe on its own. Treating
   * that as PUBLISHED marked abandoned orders as sent; this state holds the
   * uncertainty until the user answers.
   */
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  PUBLISHED = 'PUBLISHED',
}

/** Statuses whose items must not change, because they were already sent. */
export const LOCKED_STATUSES: readonly OrderStatus[] = [
  OrderStatus.AWAITING_CONFIRMATION,
  OrderStatus.PUBLISHED,
];
