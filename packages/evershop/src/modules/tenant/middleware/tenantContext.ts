import { setContextValue } from '../../graphql/services/contextHelper.js';
import { resolveStoreFromHost } from '../services/storeResolver.js';
import { runWithTenantContext } from '../services/tenantContext.js';

export default async (request, response, next) => {
  const store = await resolveStoreFromHost(request.headers.host);
  request.locals = request.locals || {};
  request.locals.store = store;
  setContextValue(request, 'store', store);
  setContextValue(request, 'storeId', store.storeId);

  runWithTenantContext(store, () => next());
};
