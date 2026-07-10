import {
  commit,
  insert,
  rollback,
  select,
  startTransaction
} from '@evershop/postgres-query-builder';
import { getConnection, pool } from '../../../../lib/postgres/connection.js';
import {
  CONFLICT,
  INVALID_PAYLOAD,
  INTERNAL_SERVER_ERROR,
  OK
} from '../../../../lib/util/httpStatus.js';
import { hashPassword } from '../../../../lib/util/passwordHelper.js';

function slugifyStoreHandle(storeName: string) {
  return String(storeName)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function getPrimaryDomain(handle: string) {
  const baseDomain = String(process.env.CARTIFY_BASE_DOMAIN || '')
    .trim()
    .toLowerCase();
  return baseDomain ? `${handle}.${baseDomain}` : null;
}

export default async (request, response) => {
  const connection = await getConnection();
  try {
    const { storeName, fullName, email, password } = request.body;
    const normalizedEmail = String(email).trim().toLowerCase();
    const handle = slugifyStoreHandle(storeName);
    if (!handle) {
      response.status(INVALID_PAYLOAD);
      response.json({
        error: {
          status: INVALID_PAYLOAD,
          message: 'Please choose a valid store name.'
        }
      });
      return;
    }

    const existingUser = await select()
      .from('admin_user')
      .where('email', 'ILIKE', normalizedEmail)
      .load(pool);

    if (existingUser) {
      response.status(CONFLICT);
      response.json({
        error: {
          status: CONFLICT,
          message: 'A merchant account with this email already exists.'
        }
      });
      return;
    }

    const existingStore = await select()
      .from('cartify_store')
      .where('handle', '=', handle)
      .load(pool);

    if (existingStore) {
      response.status(CONFLICT);
      response.json({
        error: {
          status: CONFLICT,
          message: 'A store with this name already exists.'
        }
      });
      return;
    }

    await startTransaction(connection);
    const merchant = await insert('admin_user')
      .given({
        status: true,
        email: normalizedEmail,
        password: hashPassword(password),
        full_name: fullName
      })
      .execute(connection);

    const primaryDomain = getPrimaryDomain(handle);
    const store = await insert('cartify_store')
      .given({
        name: storeName,
        handle,
        status: true,
        primary_domain: primaryDomain,
        owner_admin_user_id: merchant.admin_user_id
      })
      .execute(connection);

    await insert('admin_user_store')
      .given({
        admin_user_id: merchant.admin_user_id,
        store_id: store.store_id,
        role: 'owner'
      })
      .execute(connection);

    if (primaryDomain) {
      await insert('store_domain')
        .given({
          store_id: store.store_id,
          domain: primaryDomain,
          is_primary: true,
          status: true
        })
        .execute(connection);
    }

    await commit(connection);

    response.status(OK);
    response.json({
      data: {
        uuid: merchant.uuid,
        email: merchant.email,
        fullName: merchant.full_name,
        store: {
          uuid: store.uuid,
          name: store.name,
          handle: store.handle,
          domain: store.primary_domain
        }
      }
    });
  } catch (error) {
    await rollback(connection);
    response.status(INTERNAL_SERVER_ERROR);
    response.json({
      error: {
        status: INTERNAL_SERVER_ERROR,
        message: error.message
      }
    });
  } finally {
    connection.release();
  }
};
