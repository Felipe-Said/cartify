import { CartifyRequest } from '../../../../../types/request.js';
import { CartifyResponse } from '../../../../../types/response.js';
import { uploadShopifyThemeMedia } from '../../services/theme/shopifyThemeEditor.js';

export default async (request: CartifyRequest, response: CartifyResponse) => {
  try {
    const media = await uploadShopifyThemeMedia(request.params.theme, request.file);
    response.json({ data: media });
  } catch (error) {
    response.status(400).json({
      error: { message: error instanceof Error ? error.message : 'Upload invalido.' }
    });
  }
};
