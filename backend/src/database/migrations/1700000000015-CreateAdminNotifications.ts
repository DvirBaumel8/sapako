import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminNotifications1700000000015
  implements MigrationInterface
{
  name = 'CreateAdminNotifications1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // One row per (admin, order-handoff) — not one shared event row with a
    // join table — so read/unread and delete are naturally per-admin with
    // no join at all: deleting a row only ever removes it from the admin who
    // owns it.
    await queryRunner.query(`
      CREATE TABLE admin_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "orderId" UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        "isRead" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_admin_notifications_user_created
        ON admin_notifications("userId", "createdAt" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE admin_notifications`);
  }
}
