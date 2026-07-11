import { exportShopifyProduct, findShopifyProduct } from '../../services/shopifyAjaxProduct.js';

export default async (request, response) => {
  const handle = Array.isArray(request.params.handle)
    ? request.params.handle[0]
    : request.params.handle;
  const product = await findShopifyProduct(handle);
  if (!product) {
    response.status(404).json({ status: 404, message: 'Product not found' });
    return;
  }
  response.setHeader('Cache-Control', 'no-store');
  response.json(exportShopifyProduct(product));
};
