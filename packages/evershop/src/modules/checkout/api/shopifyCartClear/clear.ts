import { clearShopifyCart } from '../../services/shopifyAjaxCart.js';

export default async (request, response) => {
  response.status(200).json(await clearShopifyCart(request));
};
