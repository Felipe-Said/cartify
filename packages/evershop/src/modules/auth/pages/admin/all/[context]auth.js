import { select } from '@evershop/postgres-query-builder';
import { pool } from '../../../../../lib/postgres/connection.js';
import { buildUrl } from '../../../../../lib/router/buildUrl.js';
import { getCurrentStoreId } from '../../../../tenant/services/tenantContext.js';

export default async (request, response, next) => {
  const { userID } = request.session;
  // Load the user from the database
  const query = select().from('admin_user');
  query
    .where('admin_user.admin_user_id', '=', userID)
    .and('admin_user.status', '=', 1)
    .and('admin_user_store.store_id', '=', getCurrentStoreId());
  query
    .innerJoin('admin_user_store')
    .on('admin_user.admin_user_id', '=', 'admin_user_store.admin_user_id');
  const user = await query.load(pool);

  if (!user) {
    // The user may not be logged in, or the account may be disabled
    // Logout the user
    request.logoutUser(() => {
      // Check if current route is adminLogin
      if (
        request.currentRoute.id === 'adminLogin' ||
        request.currentRoute.id === 'adminLoginJson'
      ) {
        next();
      } else {
        response.redirect(buildUrl('adminLogin'));
      }
    });
  } else {
    // Delete the password field
    delete user.password;
    request.locals.user = user;
    next();
  }
};
