import { AsyncLocalStorage } from 'async_hooks';

export type TenantContext = {
  storeId: number;
  handle: string;
  name: string;
  domain?: string | null;
};

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(
  tenant: TenantContext,
  callback: () => T
): T {
  return tenantStorage.run(tenant, callback);
}

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function getCurrentStoreId(): number {
  return getTenantContext()?.storeId || 1;
}
