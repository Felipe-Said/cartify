import { addShopifyCartItems } from '../../services/shopifyAjaxCart.js';

export default async (request, response) => {
  try {
    response.status(200).json(await addShopifyCartItems(request, request.body || {}));
  } catch (error) {
    response.status(422).json({ status: 422, message: error.message, description: error.message });
  }
};
