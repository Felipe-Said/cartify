import { exportShopifyCart } from '../../services/shopifyAjaxCart.js';

export default async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json(await exportShopifyCart(request));
};
