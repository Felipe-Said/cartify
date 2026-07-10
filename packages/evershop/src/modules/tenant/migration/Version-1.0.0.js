import { execute } from '@evershop/postgres-query-builder';

const tenantTables = [
  'product',
  'category',
  'collection',
  'customer',
  'customer_group',
  'cms_page',
  'cart',
  'order',
  'coupon',
  'tax_class',
  'tax_rate',
  'shipping_method',
  'shipping_zone',
  'widget',
  'url_rewrite'
];

async function tableExists(connection, table) {
  const { rows } = await connection.query({
    text: `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    values: [table]
  });
  return rows[0]?.exists === true;
}

async function addStoreColumn(connection, table) {
  if (!(await tableExists(connection, table))) {
    return;
  }

  await execute(
    connection,
    `ALTER TABLE "${table}"
      ADD COLUMN IF NOT EXISTS "store_id" INT NOT NULL DEFAULT cartify_current_store_id()`
  );
  await execute(
    connection,
    `CREATE INDEX IF NOT EXISTS "IDX_${table.toUpperCase()}_STORE_ID"
      ON "${table}" ("store_id")`
  );
  await execute(
    connection,
    `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_${table.toUpperCase()}_STORE'
      ) THEN
        ALTER TABLE "${table}"
          ADD CONSTRAINT "FK_${table.toUpperCase()}_STORE"
          FOREIGN KEY ("store_id") REFERENCES "cartify_store" ("store_id")
          ON DELETE RESTRICT;
      END IF;
    END $$`
  );
  await execute(connection, `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
  await execute(connection, `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
  await execute(
    connection,
    `DROP POLICY IF EXISTS "cartify_tenant_isolation" ON "${table}"`
  );
  await execute(
    connection,
    `CREATE POLICY "cartify_tenant_isolation" ON "${table}"
      FOR ALL
      USING ("store_id" = cartify_current_store_id())
      WITH CHECK ("store_id" = cartify_current_store_id())`
  );
}

export default async (connection) => {
  await execute(
    connection,
    `CREATE OR REPLACE FUNCTION cartify_current_store_id()
      RETURNS INT
      LANGUAGE SQL
      STABLE
      AS $$
        SELECT COALESCE(
          NULLIF(current_setting('cartify.current_store_id', true), '')::INT,
          1
        )
      $$`
  );

  await execute(
    connection,
    `CREATE TABLE IF NOT EXISTS "cartify_store" (
      "store_id" INT GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1) PRIMARY KEY,
      "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
      "name" varchar NOT NULL,
      "handle" varchar NOT NULL,
      "status" boolean NOT NULL DEFAULT TRUE,
      "primary_domain" varchar DEFAULT NULL,
      "owner_admin_user_id" INT DEFAULT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CARTIFY_STORE_UUID_UNIQUE" UNIQUE ("uuid"),
      CONSTRAINT "CARTIFY_STORE_HANDLE_UNIQUE" UNIQUE ("handle"),
      CONSTRAINT "CARTIFY_STORE_DOMAIN_UNIQUE" UNIQUE ("primary_domain")
    )`
  );

  await execute(
    connection,
    `CREATE TABLE IF NOT EXISTS "admin_user_store" (
      "admin_user_store_id" INT GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1) PRIMARY KEY,
      "admin_user_id" INT NOT NULL,
      "store_id" INT NOT NULL,
      "role" varchar NOT NULL DEFAULT 'owner',
      "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ADMIN_USER_STORE_UNIQUE" UNIQUE ("admin_user_id", "store_id"),
      CONSTRAINT "FK_ADMIN_USER_STORE_USER" FOREIGN KEY ("admin_user_id") REFERENCES "admin_user" ("admin_user_id") ON DELETE CASCADE,
      CONSTRAINT "FK_ADMIN_USER_STORE_STORE" FOREIGN KEY ("store_id") REFERENCES "cartify_store" ("store_id") ON DELETE CASCADE
    )`
  );

  await execute(
    connection,
    `CREATE INDEX IF NOT EXISTS "IDX_ADMIN_USER_STORE_USER"
      ON "admin_user_store" ("admin_user_id")`
  );
  await execute(
    connection,
    `CREATE INDEX IF NOT EXISTS "IDX_ADMIN_USER_STORE_STORE"
      ON "admin_user_store" ("store_id")`
  );

  await execute(
    connection,
    `CREATE TABLE IF NOT EXISTS "store_domain" (
      "store_domain_id" INT GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1) PRIMARY KEY,
      "store_id" INT NOT NULL,
      "domain" varchar NOT NULL,
      "is_primary" boolean NOT NULL DEFAULT FALSE,
      "status" boolean NOT NULL DEFAULT TRUE,
      "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "STORE_DOMAIN_UNIQUE" UNIQUE ("domain"),
      CONSTRAINT "FK_STORE_DOMAIN_STORE" FOREIGN KEY ("store_id") REFERENCES "cartify_store" ("store_id") ON DELETE CASCADE
    )`
  );

  await execute(
    connection,
    `INSERT INTO "cartify_store" ("name", "handle", "status")
      VALUES ('Cartify', 'cartify', TRUE)
      ON CONFLICT ("handle") DO NOTHING`
  );

  await execute(
    connection,
    `INSERT INTO "admin_user_store" ("admin_user_id", "store_id", "role")
      SELECT au.admin_user_id, cs.store_id, 'owner'
      FROM "admin_user" au
      CROSS JOIN "cartify_store" cs
      WHERE cs.handle = 'cartify'
      ON CONFLICT ("admin_user_id", "store_id") DO NOTHING`
  );

  await execute(
    connection,
    `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_CARTIFY_STORE_OWNER'
      ) THEN
        ALTER TABLE "cartify_store"
          ADD CONSTRAINT "FK_CARTIFY_STORE_OWNER"
          FOREIGN KEY ("owner_admin_user_id") REFERENCES "admin_user" ("admin_user_id")
          ON DELETE SET NULL;
      END IF;
    END $$`
  );

  for (const table of tenantTables) {
    await addStoreColumn(connection, table);
  }
};
