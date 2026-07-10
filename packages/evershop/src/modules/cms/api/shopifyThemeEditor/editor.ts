import { CartifyRequest } from '../../../../../types/request.js';
import { CartifyResponse } from '../../../../../types/response.js';
import {
  getShopifyThemeEditor,
  saveShopifyThemeEditor
} from '../../services/theme/shopifyThemeEditor.js';

export default async (request: CartifyRequest, response: CartifyResponse) => {
  try {
    if (request.method === 'GET') {
      const data = await getShopifyThemeEditor(
        request.params.theme,
        typeof request.query.template === 'string' ? request.query.template : undefined
      );
      response.json({ data });
      return;
    }

    await saveShopifyThemeEditor(
      request.params.theme,
      request.body.template,
      request.body.templateData,
      request.body.globalSettings
    );
    response.json({ data: { saved: true } });
  } catch (error) {
    response.status(400).json({
      error: { message: error instanceof Error ? error.message : 'Tema invalido.' }
    });
  }
};
