CREATE OR REPLACE FUNCTION cartify_current_store_id()
RETURNS INT
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('cartify.current_store_id', true), '')::INT,
    1
  )
$$;

CREATE TABLE IF NOT EXISTS "cartify_store" (
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
);

CREATE TABLE IF NOT EXISTS "admin_user_store" (
  "admin_user_store_id" INT GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1) PRIMARY KEY,
  "admin_user_id" INT NOT NULL,
  "store_id" INT NOT NULL,
  "role" varchar NOT NULL DEFAULT 'owner',
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ADMIN_USER_STORE_UNIQUE" UNIQUE ("admin_user_id", "store_id"),
  CONSTRAINT "FK_ADMIN_USER_STORE_USER" FOREIGN KEY ("admin_user_id") REFERENCES "admin_user" ("admin_user_id") ON DELETE CASCADE,
  CONSTRAINT "FK_ADMIN_USER_STORE_STORE" FOREIGN KEY ("store_id") REFERENCES "cartify_store" ("store_id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_ADMIN_USER_STORE_USER"
  ON "admin_user_store" ("admin_user_id");

CREATE INDEX IF NOT EXISTS "IDX_ADMIN_USER_STORE_STORE"
  ON "admin_user_store" ("store_id");

CREATE TABLE IF NOT EXISTS "store_domain" (
  "store_domain_id" INT GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1) PRIMARY KEY,
  "store_id" INT NOT NULL,
  "domain" varchar NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT FALSE,
  "status" boolean NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "STORE_DOMAIN_UNIQUE" UNIQUE ("domain"),
  CONSTRAINT "FK_STORE_DOMAIN_STORE" FOREIGN KEY ("store_id") REFERENCES "cartify_store" ("store_id") ON DELETE CASCADE
);

INSERT INTO "cartify_store" ("name", "handle", "status")
VALUES ('Cartify', 'cartify', TRUE)
ON CONFLICT ("handle") DO NOTHING;

INSERT INTO "admin_user_store" ("admin_user_id", "store_id", "role")
SELECT au.admin_user_id, cs.store_id, 'owner'
FROM "admin_user" au
CROSS JOIN "cartify_store" cs
WHERE cs.handle = 'cartify'
ON CONFLICT ("admin_user_id", "store_id") DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_CARTIFY_STORE_OWNER'
  ) THEN
    ALTER TABLE "cartify_store"
      ADD CONSTRAINT "FK_CARTIFY_STORE_OWNER"
      FOREIGN KEY ("owner_admin_user_id") REFERENCES "admin_user" ("admin_user_id")
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
DECLARE
  table_name text;
  tenant_tables text[] := ARRAY[
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
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND information_schema.tables.table_name = table_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS "store_id" INT NOT NULL DEFAULT cartify_current_store_id()',
        table_name
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I ("store_id")',
        'IDX_' || upper(table_name) || '_STORE_ID',
        table_name
      );
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_' || upper(table_name) || '_STORE'
      ) THEN
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("store_id") REFERENCES "cartify_store" ("store_id") ON DELETE RESTRICT',
          table_name,
          'FK_' || upper(table_name) || '_STORE'
        );
      END IF;
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
      EXECUTE format(
        'DROP POLICY IF EXISTS "cartify_tenant_isolation" ON %I',
        table_name
      );
      EXECUTE format(
        'CREATE POLICY "cartify_tenant_isolation" ON %I FOR ALL USING ("store_id" = cartify_current_store_id()) WITH CHECK ("store_id" = cartify_current_store_id())',
        table_name
      );
    END IF;
  END LOOP;
END $$;

UPDATE "setting"
SET "value" = 'Cartify'
WHERE "name" = 'storeName' AND "value" ILIKE '%evershop%';
