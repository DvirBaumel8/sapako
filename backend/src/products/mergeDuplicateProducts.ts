/**
 * Merges active products that share a supplier and a name (ignoring
 * whitespace and Latin case) into one survivor per group.
 *
 * Exported separately from the migration that runs it so it can be tested
 * against a real database: by the time e2e tests run, migrations have
 * already applied and the unique index would refuse the duplicates a test
 * needs to seed.
 */
export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export interface MergeSummary {
  groups: number;
  hidden: number;
  orderLinesRepointed: number;
  draftLinesCollapsed: number;
}

export const NORMALIZED_NAME_INDEX = 'uq_products_provider_normalized_name';

const NORMALIZED_NAME = `lower(btrim(regexp_replace(name, '\\s+', ' ', 'g')))`;

export async function createNormalizedNameIndex(
  runner: SqlRunner,
): Promise<void> {
  // Partial: hidden and soft-deleted products are exempt, so a merged copy
  // never blocks its survivor and can be restored by hand later.
  await runner.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${NORMALIZED_NAME_INDEX}
       ON products ("providerId", (${NORMALIZED_NAME}))
       WHERE "isActive"`,
  );
}

export async function dropNormalizedNameIndex(
  runner: SqlRunner,
): Promise<void> {
  await runner.query(`DROP INDEX IF EXISTS ${NORMALIZED_NAME_INDEX}`);
}

export async function mergeDuplicateProducts(
  runner: SqlRunner,
): Promise<MergeSummary> {
  // Every boolean is coalesced: Postgres sorts NULL first under DESC, so a
  // product with no barcode would otherwise outrank one with a real GTIN.
  // A temp table is per-connection: callers must pass ONE connection (a
  // QueryRunner), never a pooled DataSource whose calls may each land on a
  // different connection.
  await runner.query(`DROP TABLE IF EXISTS pg_temp.merge_map`);
  await runner.query(`
    CREATE TEMP TABLE merge_map AS
    WITH ranked AS (
      SELECT
        p.id,
        p."providerId",
        lower(btrim(regexp_replace(p.name, '\\s+', ' ', 'g'))) AS norm,
        row_number() OVER (
          PARTITION BY p."providerId", lower(btrim(regexp_replace(p.name, '\\s+', ' ', 'g')))
          ORDER BY
            EXISTS (SELECT 1 FROM order_items oi WHERE oi."productId" = p.id) DESC,
            coalesce(p.barcode ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$', false) DESC,
            (p.barcode IS NOT NULL AND p.barcode <> '') DESC,
            p."createdAt" ASC,
            p.id ASC
        ) AS rn
      FROM products p
      WHERE p."isActive"
    )
    SELECT loser.id AS loser_id, survivor.id AS survivor_id
    FROM ranked loser
    JOIN ranked survivor
      ON survivor."providerId" = loser."providerId"
     AND survivor.norm = loser.norm
     AND survivor.rn = 1
    WHERE loser.rn > 1
  `);

  await runner.query(`
    UPDATE products s
    SET "additionalBarcodes" = (
      SELECT coalesce(array_agg(DISTINCT code ORDER BY code), '{}')
      FROM (
        SELECT unnest(s."additionalBarcodes") AS code
        UNION
        SELECT l.barcode FROM merge_map m JOIN products l ON l.id = m.loser_id
          WHERE m.survivor_id = s.id
        UNION
        SELECT unnest(l."additionalBarcodes") FROM merge_map m JOIN products l ON l.id = m.loser_id
          WHERE m.survivor_id = s.id
      ) codes
      WHERE code IS NOT NULL AND code <> '' AND code IS DISTINCT FROM s.barcode
    )
    WHERE s.id IN (SELECT survivor_id FROM merge_map)
  `);

  // On a DRAFT, staff see one line per product, so lines that would land on
  // the same survivor with the same unit become one (quantities summed).
  // Sent orders keep their lines as history and are only repointed below.
  const [collapsed] = await runner.query(`
    WITH lines AS (
      SELECT oi.id, oi."orderId", oi."unitType", oi.quantity,
             coalesce(m.survivor_id, oi."productId") AS sid,
             (m.loser_id IS NULL) AS own
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId" AND o.status = 'DRAFT'
      LEFT JOIN merge_map m ON m.loser_id = oi."productId"
      WHERE m.loser_id IS NOT NULL
         OR oi."productId" IN (SELECT survivor_id FROM merge_map)
    ),
    ranked AS (
      SELECT id, quantity,
        row_number() OVER w AS rn,
        count(*) OVER w2 AS cnt,
        sum(quantity) OVER w2 AS total
      FROM lines
      WINDOW w AS (PARTITION BY "orderId", sid, "unitType" ORDER BY own DESC, id ASC),
             w2 AS (PARTITION BY "orderId", sid, "unitType")
    ),
    kept AS (
      UPDATE order_items oi SET quantity = r.total
      FROM ranked r WHERE oi.id = r.id AND r.rn = 1 AND r.cnt > 1
      RETURNING oi.id
    ),
    dropped AS (
      DELETE FROM order_items oi USING ranked r
      WHERE oi.id = r.id AND r.rn > 1
      RETURNING oi.id
    )
    SELECT (SELECT count(*)::int FROM dropped) AS n
  `);

  // Counted after the collapse so deleted lines aren't reported as repointed.
  const [counts] = await runner.query(`
    SELECT
      count(DISTINCT survivor_id)::int AS groups,
      count(*)::int AS hidden,
      (SELECT count(*)::int FROM order_items oi
         WHERE oi."productId" IN (SELECT loser_id FROM merge_map)) AS "orderLinesRepointed"
    FROM merge_map
  `);

  await runner.query(`
    UPDATE order_items oi SET "productId" = m.survivor_id
    FROM merge_map m WHERE oi."productId" = m.loser_id
  `);

  await runner.query(`
    UPDATE products p SET "isActive" = false, "mergedIntoProductId" = m.survivor_id
    FROM merge_map m WHERE p.id = m.loser_id
  `);

  await runner.query(`DROP TABLE IF EXISTS pg_temp.merge_map`);

  return {
    groups: counts.groups,
    hidden: counts.hidden,
    orderLinesRepointed: counts.orderLinesRepointed,
    draftLinesCollapsed: collapsed.n,
  };
}
