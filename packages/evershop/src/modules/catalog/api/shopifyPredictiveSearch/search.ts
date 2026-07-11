import { productCards, searchShopifyProducts } from '../../services/shopifyAjaxProduct.js';

export default async (request, response) => {
  const term = String(request.query.q || '');
  const sectionId = String(request.query.section_id || 'predictive-search');
  const products = term ? await searchShopifyProducts(term, 10) : [];
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.send(productCards(products, sectionId));
};
