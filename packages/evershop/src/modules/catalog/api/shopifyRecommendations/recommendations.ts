import { productCards, recommendShopifyProducts } from '../../services/shopifyAjaxProduct.js';

export default async (request, response) => {
  const productId = Number(request.query.product_id || 0);
  const limit = Number(request.query.limit || 4);
  const sectionId = String(request.query.section_id || 'product-recommendations');
  const products = await recommendShopifyProducts(productId, limit);
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.send(productCards(products, sectionId));
};
