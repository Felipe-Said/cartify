import { CartifyRequest } from '../../../../../types/request.js';
import { CartifyResponse } from '../../../../../types/response.js';
import { renderShopifyThemePreview } from '../../../services/theme/renderShopifyThemePreview.js';

export default async (
  request: CartifyRequest,
  response: CartifyResponse
) => {
  try {
    const html = await renderShopifyThemePreview(request.params.theme);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview failed.';
    response.status(500).send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { margin: 0; font-family: Arial, sans-serif; background: #f1f1f1; color: #202223; }
            main { max-width: 720px; margin: 15vh auto; padding: 24px; background: #fff; border: 1px solid #d8d8d8; border-radius: 12px; }
            h1 { margin: 0 0 12px; font-size: 20px; }
            p { margin: 0; line-height: 1.5; color: #616161; }
          </style>
        </head>
        <body>
          <main>
            <h1>Preview do tema indisponivel</h1>
            <p>${message}</p>
          </main>
        </body>
      </html>
    `);
  }
};
