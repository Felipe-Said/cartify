import { select } from '@evershop/postgres-query-builder';
import { pool } from '../../../lib/postgres/connection.js';
import { getBaseUrl } from '../../../lib/util/getBaseUrl.js';
import { TenantContext } from './tenantContext.js';

function normalizeHost(host?: string | null) {
  return String(host || '')
    .split(':')[0]
    .trim()
    .toLowerCase();
}

function getPlatformHosts() {
  const hosts = new Set<string>();
  const envHosts = String(process.env.CARTIFY_PLATFORM_DOMAINS || '')
    .split(',')
    .map((host) => normalizeHost(host))
    .filter(Boolean);
  envHosts.forEach((host) => hosts.add(host));

  try {
    hosts.add(normalizeHost(new URL(getBaseUrl()).host));
  } catch {
    // Ignore base URL parsing during early boot.
  }

  hosts.add('localhost');
  hosts.add('127.0.0.1');
  return hosts;
}

function getSubdomainHandle(host: string) {
  const baseDomain = normalizeHost(process.env.CARTIFY_BASE_DOMAIN);
  if (!baseDomain || !host.endsWith(`.${baseDomain}`)) {
    return null;
  }
  const handle = host.slice(0, -(baseDomain.length + 1));
  return handle && !handle.includes('.') ? handle : null;
}

function mapStore(row: any, host: string): TenantContext {
  return {
    storeId: Number(row.store_id),
    handle: row.handle,
    name: row.name,
    domain: row.primary_domain || host || null
  };
}

export async function resolveStoreFromHost(hostHeader?: string | null) {
  const host = normalizeHost(hostHeader);
  const platformHosts = getPlatformHosts();

  try {
    if (host && !platformHosts.has(host)) {
      const domain = await select()
        .from('store_domain')
        .where('domain', '=', host)
        .and('status', '=', true)
        .load(pool);

      if (domain) {
        const store = await select()
          .from('cartify_store')
          .where('store_id', '=', domain.store_id)
          .and('status', '=', true)
          .load(pool);
        if (store) {
          return mapStore(store, host);
        }
      }

      const directStore = await select()
        .from('cartify_store')
        .where('primary_domain', '=', host)
        .and('status', '=', true)
        .load(pool);
      if (directStore) {
        return mapStore(directStore, host);
      }

      const handle = getSubdomainHandle(host);
      if (handle) {
        const subdomainStore = await select()
          .from('cartify_store')
          .where('handle', '=', handle)
          .and('status', '=', true)
          .load(pool);
        if (subdomainStore) {
          return mapStore(subdomainStore, host);
        }
      }
    }

    const platformStore = await select()
      .from('cartify_store')
      .where(
        'handle',
        '=',
        process.env.CARTIFY_PLATFORM_STORE_HANDLE || 'cartify'
      )
      .load(pool);

    if (platformStore) {
      return mapStore(platformStore, host);
    }
  } catch (error) {
    // Tenant tables may not exist before the first migration. Keep booting.
  }

  return {
    storeId: 1,
    handle: process.env.CARTIFY_PLATFORM_STORE_HANDLE || 'cartify',
    name: 'Cartify',
    domain: host || null
  };
}
