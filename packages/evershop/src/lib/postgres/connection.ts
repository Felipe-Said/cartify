import fs from 'fs';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
import { PoolClient } from '@evershop/postgres-query-builder';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { getTenantContext } from '../../modules/tenant/services/tenantContext.js';
import { getConfig } from '../util/getConfig.js';

// Use env for the database connection, maintain the backward compatibility
const connectionSetting: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT as unknown as number,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 20
};

function getSslMode() {
  if (process.env.DB_SSLMODE) {
    return process.env.DB_SSLMODE;
  }

  if (process.env.DATABASE_URL) {
    try {
      return new URL(process.env.DATABASE_URL).searchParams.get('sslmode');
    } catch {
      return undefined;
    }
  }

  return undefined;
}

// Support SSL
const sslMode = getSslMode();
switch (sslMode) {
  case 'disable': {
    connectionSetting.ssl = false;
    break;
  }
  case 'require':
  case 'prefer':
  case 'verify-ca':
  case 'verify-full': {
    const ssl: PoolConfig['ssl'] = {
      rejectUnauthorized: true
    };
    const ca = process.env.DB_SSLROOTCERT;
    if (ca) {
      ssl.ca = fs.readFileSync(ca).toString();
    }
    const cert = process.env.DB_SSLCERT;
    if (cert) {
      ssl.cert = fs.readFileSync(cert).toString();
    }
    const key = process.env.DB_SSLKEY;
    if (key) {
      ssl.key = fs.readFileSync(key).toString();
    }
    connectionSetting.ssl = ssl;
    break;
  }
  case 'no-verify': {
    connectionSetting.ssl = {
      rejectUnauthorized: false
    };
    break;
  }
  default: {
    connectionSetting.ssl = false;
    break;
  }
}

// onConnect is awaited by pg before the client is handed to user code,
// unlike pool.on('connect', ...) which is not awaited (deprecated in pg@8.19.0).
// Cast needed because @types/pg doesn't yet declare onConnect in PoolConfig.
const pool = new Pool({
  ...connectionSetting,
  onConnect: async (client: import('pg').PoolClient) => {
    const timeZone = getConfig('shop.timezone', 'UTC');
    await client.query(`SET TIMEZONE TO "${timeZone}";`);
    patchClientForTenantContext(client);
  }
} as PoolConfig);

function getTenantStoreId() {
  return String(getTenantContext()?.storeId || 1);
}

function isTenantConfigQuery(queryConfig: any) {
  const text = typeof queryConfig === 'string' ? queryConfig : queryConfig?.text;
  return (
    typeof text === 'string' && text.includes('cartify.current_store_id')
  );
}

function patchClientForTenantContext(client: import('pg').PoolClient) {
  const tenantClient = client as import('pg').PoolClient & {
    CARTIFY_TENANT_PATCHED?: boolean;
  };
  if (tenantClient.CARTIFY_TENANT_PATCHED) {
    return;
  }

  const originalQuery = tenantClient.query.bind(tenantClient);
  tenantClient.query = (async (...args: any[]) => {
    const queryConfig = args[0];
    if (!isTenantConfigQuery(queryConfig)) {
      await originalQuery('SELECT set_config($1, $2, false)', [
        'cartify.current_store_id',
        getTenantStoreId()
      ]);
    }
    return originalQuery(...args);
  }) as typeof tenantClient.query;
  tenantClient.CARTIFY_TENANT_PATCHED = true;
}

const originalPoolQuery = pool.query.bind(pool);
pool.query = ((...args: any[]) => {
  const queryConfig = args[0];
  if (isTenantConfigQuery(queryConfig)) {
    return originalPoolQuery(...args);
  }

  const callback =
    typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
  const queryArgs = callback ? args.slice(0, -1) : args;
  const runQuery = async () => {
    const client = await pool.connect();
    try {
      return await client.query(...queryArgs);
    } finally {
      client.release();
    }
  };

  if (callback) {
    runQuery()
      .then((result) => callback(null, result))
      .catch((error) => callback(error));
    return undefined;
  }

  return runQuery();
}) as typeof pool.query;

async function getConnection(): Promise<PoolClient> {
  return await pool.connect();
}

export { pool, getConnection, connectionSetting };
