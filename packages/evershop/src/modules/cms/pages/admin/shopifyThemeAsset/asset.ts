import fs from 'fs/promises';
import path from 'path';
import { CartifyRequest } from '../../../../../types/request.js';
import { CartifyResponse } from '../../../../../types/response.js';
import { getShopifyThemeAssetPath } from '../../../services/theme/renderShopifyThemePreview.js';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

export default async (
  request: CartifyRequest,
  response: CartifyResponse
) => {
  try {
    const assetName = String(request.params[0] || '');
    const assetPath = await getShopifyThemeAssetPath(
      request.params.theme,
      assetName
    );
    const buffer = await fs.readFile(assetPath);
    const ext = path.extname(assetPath).toLowerCase();
    response.setHeader(
      'Content-Type',
      contentTypes[ext] || 'application/octet-stream'
    );
    response.setHeader('Cache-Control', 'public, max-age=60');
    response.send(buffer);
  } catch {
    response.status(404).send('Not Found');
  }
};
