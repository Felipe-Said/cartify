import { select } from '@evershop/postgres-query-builder';
import { pool } from '../../../lib/postgres/connection.js';
import { CartifyRequest } from '../../../types/request.js';
import { createNewCart } from './createNewCart.js';
import { getMyCart } from './getMyCart.js';
import { saveCart } from './saveCart.js';

const cents = (value: unknown) => Math.round(Number(value || 0) * 100);

function requestIdentity(request: CartifyRequest) {
  const locals = request.locals || ({} as any);
  return {
    sid: request.sessionID || locals.sessionID || '',
    customer: locals.customer
  };
}

async function currentCart(request: CartifyRequest, create = false) {
  const { sid, customer } = requestIdentity(request);
  const cart = await getMyCart(sid, customer?.customer_id);
  return cart || (create ? createNewCart(sid, customer || {}) : null);
}

async function productImage(productId: number) {
  const image = await select()
    .from('product_image')
    .where('product_image_product_id', '=', productId)
    .and('is_main', '=', true)
    .load(pool);
  return image?.origin_image || null;
}

async function exportItem(item: any) {
  const data = item.export();
  const price = cents(data.final_price ?? data.product_price);
  const quantity = Number(data.qty || 0);
  return {
    id: data.product_id,
    key: data.uuid,
    variant_id: data.product_id,
    product_id: data.product_id,
    title: data.product_name || data.product_sku,
    product_title: data.product_name || data.product_sku,
    variant_title: null,
    sku: data.product_sku,
    quantity,
    price,
    final_price: price,
    line_price: price * quantity,
    final_line_price: price * quantity,
    url: `/products/${data.product_uuid || data.product_id}`,
    image: await productImage(data.product_id),
    featured_image: {
      url: await productImage(data.product_id),
      alt: data.product_name || ''
    },
    properties: {},
    discounts: [],
    requires_shipping: true,
    taxable: true
  };
}

export async function exportShopifyCart(request: CartifyRequest) {
  const cart = await currentCart(request);
  const items = cart
    ? await Promise.all(cart.getItems().map((item) => exportItem(item)))
    : [];
  const total = items.reduce((sum, item) => sum + item.final_line_price, 0);
  return {
    token: cart?.getData('uuid') || null,
    note: cart?.getData('note') || null,
    attributes: {},
    original_total_price: total,
    total_price: total,
    total_discount: 0,
    total_weight: Number(cart?.getData('total_weight') || 0),
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    requires_shipping: items.length > 0,
    currency: cart?.getData('currency') || 'BRL',
    items_subtotal_price: total,
    cart_level_discount_applications: [],
    checkout_url: '/checkout'
  };
}

async function resolveProduct(id: unknown) {
  const query = select().from('product').where('status', '=', 1);
  const value = String(id || '');
  if (/^\d+$/.test(value)) {
    query.andWhere('product_id', '=', Number(value));
  } else {
    query.andWhere('uuid', '=', value);
  }
  return query.load(pool);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sectionPayload(raw: unknown, cart: any) {
  const names = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(',')
        .filter(Boolean);
  const lines = cart.items
    .map(
      (item) => `<line-item data-line-key="${escapeHtml(item.key)}">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">` : ''}
        <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>
        <span>${(item.final_price / 100).toFixed(2)}</span>
        <input type="number" value="${item.quantity}" data-line-key="${escapeHtml(item.key)}" min="0">
        <a href="/cart/change?id=${encodeURIComponent(item.key)}&quantity=0">Remover</a>
      </line-item>`
    )
    .join('');
  return Object.fromEntries(names.map((name) => {
    const content = name === 'variant-added'
      ? `<div class="cart-notification"><strong>Produto adicionado ao carrinho</strong></div>`
      : `<cart-drawer id="cart-drawer" class="cart-drawer">
          <div class="cart-drawer__line-items">${lines}</div>
          <div slot="footer"><strong>Total: ${(cart.total_price / 100).toFixed(2)}</strong><a href="/checkout">Finalizar compra</a></div>
        </cart-drawer>`;
    return [name, `<div id="shopify-section-${name}" class="shopify-section">${content}</div>`];
  }));
}

export async function addShopifyCartItems(
  request: CartifyRequest,
  body: Record<string, any>
) {
  const requested = Array.isArray(body.items)
    ? body.items
    : [{ id: body.id, quantity: body.quantity || 1, properties: body.properties }];
  const cart = await currentCart(request, true);
  const added: any[] = [];
  for (const requestedItem of requested) {
    const product = await resolveProduct(requestedItem.id);
    if (!product) throw new Error('Product variant not found');
    const item = await cart!.addItem(
      product.product_id,
      Math.max(1, Number(requestedItem.quantity || 1)),
      { request }
    );
    added.push(await exportItem(item));
  }
  await saveCart(cart!);
  const exportedCart = await exportShopifyCart(request);
  const sections = sectionPayload(body.sections, exportedCart);
  return added.length === 1
    ? { ...added[0], sections }
    : { items: added, sections };
}

function findItem(cart: any, id: unknown, line?: unknown) {
  if (line !== undefined && Number(line) > 0) {
    return cart.getItems()[Number(line) - 1];
  }
  const value = String(id || '');
  return cart
    .getItems()
    .find(
      (item) =>
        item.getData('uuid') === value ||
        String(item.getData('product_id')) === value ||
        item.getData('product_sku') === value
    );
}

export async function changeShopifyCart(
  request: CartifyRequest,
  body: Record<string, any>
) {
  const cart = await currentCart(request);
  if (!cart) return exportShopifyCart(request);
  const item = findItem(cart, body.id, body.line);
  if (!item) throw new Error('Cart line not found');
  const quantity = Math.max(0, Number(body.quantity || 0));
  const current = Number(item.getData('qty') || 0);
  if (quantity === 0) {
    await cart.removeItem(item.getData('uuid'), { request });
  } else if (quantity !== current) {
    await cart.updateItemQty(
      item.getData('uuid'),
      String(Math.abs(quantity - current)),
      quantity > current ? 'increase' : 'decrease',
      { request }
    );
  }
  await saveCart(cart);
  const exportedCart = await exportShopifyCart(request);
  return {
    ...exportedCart,
    sections: sectionPayload(body.sections, exportedCart)
  };
}

export async function updateShopifyCart(
  request: CartifyRequest,
  body: Record<string, any>
) {
  const updates = body.updates || {};
  for (const [id, quantity] of Object.entries(updates)) {
    await changeShopifyCart(request, { id, quantity });
  }
  const exportedCart = await exportShopifyCart(request);
  return {
    ...exportedCart,
    sections: sectionPayload(body.sections, exportedCart)
  };
}

export async function clearShopifyCart(request: CartifyRequest) {
  const cart = await currentCart(request);
  if (cart) {
    for (const item of [...cart.getItems()]) {
      await cart.removeItem(item.getData('uuid'), { request });
    }
    await saveCart(cart);
  }
  return exportShopifyCart(request);
}
