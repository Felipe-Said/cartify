import {
  INTERNAL_SERVER_ERROR,
  OK,
  UNPROCESSABLE_ENTITY
} from '../../../../lib/util/httpStatus.js';
import { publishStoreTheme } from '../../services/theme/publishStoreTheme.js';

export default async (request, response) => {
  try {
    const result = await publishStoreTheme(request.params.theme);
    response.status(OK);
    response.json({ data: result });
  } catch (error) {
    const status =
      error.message && error.message.includes('Liquid')
        ? UNPROCESSABLE_ENTITY
        : INTERNAL_SERVER_ERROR;
    response.status(status);
    response.json({
      error: {
        status,
        message: error.message
      }
    });
  }
};
