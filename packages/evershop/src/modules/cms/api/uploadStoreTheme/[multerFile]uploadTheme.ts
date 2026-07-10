import {
  INVALID_PAYLOAD,
  INTERNAL_SERVER_ERROR,
  OK
} from '../../../../lib/util/httpStatus.js';
import { uploadShopifyTheme } from '../../services/theme/uploadShopifyTheme.js';

export default async (request, response) => {
  try {
    const theme = await uploadShopifyTheme(request.file);
    response.status(OK).json({
      data: {
        theme
      }
    });
  } catch (error) {
    const status =
      error.message &&
      (error.message.includes('.zip') ||
        error.message.includes('50 MB') ||
        error.message.includes('Nenhum arquivo') ||
        error.message.includes('layout/theme.liquid'))
        ? INVALID_PAYLOAD
        : INTERNAL_SERVER_ERROR;
    response.status(status).json({
      error: {
        status,
        message: error.message
      }
    });
  }
};
