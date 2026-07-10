import stripJsonComments from 'strip-json-comments';

/**
 * Shopify-generated JSON files commonly begin with a /* ... *\/ warning.
 * Preserve string offsets while stripping comments so parser errors still
 * point to the correct location in the original file.
 */
export function parseShopifyJson<T = unknown>(source: string): T {
  return JSON.parse(stripJsonComments(source, { whitespace: true })) as T;
}
