import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Splits "published" into what the app can observe and what it can only be
 * told.
 *
 * Opening WhatsApp is a one-way handoff: wa.me returns nothing, so the app
 * cannot know whether the message was actually sent. Until now the order was
 * marked PUBLISHED at handoff, which meant an order the user opened and then
 * abandoned still read as sent — and publishedAt recorded when WhatsApp was
 * opened, not when the supplier was contacted.
 *
 * AWAITING_CONFIRMATION holds that uncertainty explicitly, and publishedAt is
 * now set only once the user confirms.
 */
export class ConfirmOrderSend1700000000012 implements MigrationInterface {
  name = 'ConfirmOrderSend1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and
    // TypeORM wraps each migration in one. Swapping the type does the same
    // job transactionally: the USING cast maps every existing row by name,
    // so DRAFT stays DRAFT and PUBLISHED stays PUBLISHED.
    await queryRunner.query(
      `ALTER TYPE orders_status_enum RENAME TO orders_status_enum_old`,
    );
    await queryRunner.query(
      `CREATE TYPE orders_status_enum AS ENUM ('DRAFT', 'AWAITING_CONFIRMATION', 'PUBLISHED')`,
    );
    // The default has to go before the cast: Postgres will not re-type a
    // column while a default of the old type is attached to it.
    await queryRunner.query(
      `ALTER TABLE orders ALTER COLUMN status DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE orders ALTER COLUMN status TYPE orders_status_enum USING status::text::orders_status_enum`,
    );
    await queryRunner.query(
      `ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(`DROP TYPE orders_status_enum_old`);

    // When WhatsApp was opened. Distinct from publishedAt so the confirmation
    // prompt can say how long ago the handoff happened.
    await queryRunner.query(
      `ALTER TABLE orders ADD COLUMN "handedOffAt" TIMESTAMPTZ`,
    );

    // When the record email went out. Nullable because the email must never
    // fail a confirmation — this is what makes a silent Resend outage
    // visible instead of simply becoming no mail arriving.
    await queryRunner.query(
      `ALTER TABLE orders ADD COLUMN "notificationSentAt" TIMESTAMPTZ`,
    );

    // Orders already in flight when this deploys have no handoff timestamp;
    // their publishedAt is the closest thing to one.
    await queryRunner.query(
      `UPDATE orders SET "handedOffAt" = "publishedAt" WHERE "publishedAt" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Anything still awaiting confirmation goes back to DRAFT rather than
    // PUBLISHED: the whole point of the state is that nobody established the
    // message was sent, and reverting must not assert it was.
    await queryRunner.query(
      `UPDATE orders SET status = 'DRAFT' WHERE status = 'AWAITING_CONFIRMATION'`,
    );
    await queryRunner.query(
      `ALTER TABLE orders DROP COLUMN "notificationSentAt"`,
    );
    await queryRunner.query(`ALTER TABLE orders DROP COLUMN "handedOffAt"`);
    await queryRunner.query(
      `ALTER TYPE orders_status_enum RENAME TO orders_status_enum_old`,
    );
    await queryRunner.query(
      `CREATE TYPE orders_status_enum AS ENUM ('DRAFT', 'PUBLISHED')`,
    );
    await queryRunner.query(
      `ALTER TABLE orders ALTER COLUMN status DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE orders ALTER COLUMN status TYPE orders_status_enum USING status::text::orders_status_enum`,
    );
    await queryRunner.query(
      `ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(`DROP TYPE orders_status_enum_old`);
  }
}
