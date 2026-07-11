import { select } from '@evershop/postgres-query-builder';
import { pool } from '../../../lib/postgres/connection.js';
import { getProductsBaseQuery } from './getProductsBaseQuery.js';

const cents = (value: unknown) => Math.round(Number(value || 0) * 100);

export function exportShopifyProduct(product: any) {
  const available =
    product.manage_stock !== true ||
    (Number(product.qty || 0) > 0 && product.stock_availability !== false);
  const variant = {
    id: product.product_id,
    title: product.name,
    option1: product.name,
    option2: null,
    option3: null,
    sku: product.sku,
    requires_shipping: Number(product.weight || 0) > 0,
    taxable: true,
    featured_image: product.origin_image || null,
    available,
    name: product.name,
    public_title: null,
    options: [product.name],
    price: cents(product.price),
    weight: Number(product.weight || 0),
    compare_at_price: product.compare_at_price
      ? cents(product.compare_at_price)
      : null,
    inventory_management: product.manage_stock ? 'cartify' : null,
    inventory_quantity: Number(product.qty || 0)
  };
  return {
    id: product.product_id,
    title: product.name,
    handle: product.url_key || product.uuid,
    description: product.description || '',
    published_at: product.created_at,
    created_at: product.created_at,
    vendor: '',
    type: '',
    tags: [],
    price: variant.price,
    price_min: variant.price,
    price_max: variant.price,
    available,
    price_varies: false,
    compare_at_price: variant.compare_at_price,
    compare_at_price_min: variant.compare_at_price,
    compare_at_price_max: variant.compare_at_price,
    compare_at_price_varies: false,
    variants: [variant],
    images: product.origin_image ? [product.origin_image] : [],
    featured_image: product.origin_image || null,
    options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
    url: `/product/${product.uuid}`,
    media: []
  };
}

export async function findShopifyProduct(handle: string) {
  const query = getProductsBaseQuery();
  query.where('product.status', '=', 1);
  if (/^\d+$/.test(handle)) {
    query.andWhere('product.product_id', '=', Number(handle));
    return query.load(pool);
  }
  query.andWhere('product.uuid', '=', handle);
  const product = await query.load(pool);
  if (product) return product;
  const urlQuery = getProductsBaseQuery();
  urlQuery
    .where('product.status', '=', 1)
    .andWhere('product_description.url_key', '=', handle);
  return urlQuery.load(pool);
}

export async function searchShopifyProducts(term: string, limit = 10) {
  const query = getProductsBaseQuery();
  query
    .where('product.status', '=', 1)
    .andWhere('product_description.name', 'LIKE', `%${term}%`);
  query.limit(Math.min(Math.max(limit, 1), 20));
  return query.execute(pool);
}

export async function recommendShopifyProducts(productId: number, limit = 4) {
  const query = getProductsBaseQuery();
  query
    .where('product.status', '=', 1)
    .andWhere('product.product_id', '<>', productId);
  query.limit(Math.min(Math.max(limit, 1), 10));
  return query.execute(pool);
}

export function productCards(products: any[], sectionId: string) {
  const cards = products
    .map(
      (product) => `<article class="product-card">
        <a href="/product/${product.uuid}">
          ${product.origin_image ? `<img src="${product.origin_image}" alt="${product.name || ''}">` : ''}
          <span>${product.name || ''}</span>
          <span>${Number(product.price || 0).toFixed(2)}</span>
        </a>
      </article>`
    )
    .join('');
  return `<div id="shopify-section-${sectionId}" class="shopify-section"><div class="product-list">${cards}</div></div>`;
}
