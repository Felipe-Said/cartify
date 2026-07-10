import fs from 'fs/promises';
import path from 'path';
import { Liquid } from 'liquidjs';
import { CONSTANTS } from '../../../../lib/helpers.js';
import { readShopifyTheme } from '../../../../lib/shopify-theme/readShopifyTheme.js';

type ShopifySectionConfig = {
  type?: string;
  settings?: Record<string, unknown>;
  blocks?: Record<string, unknown>;
  block_order?: string[];
};

type ShopifyTemplateJson = {
  sections?: Record<string, ShopifySectionConfig>;
  order?: string[];
};

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertThemePath(themeName: string) {
  const themePath = path.resolve(CONSTANTS.THEMEPATH, themeName);
  const themesRoot = path.resolve(CONSTANTS.THEMEPATH);
  if (!themePath.startsWith(themesRoot + path.sep)) {
    throw new Error('Invalid theme path.');
  }
  return themePath;
}

async function readTextIfExists(filePath: string) {
  if (!(await exists(filePath))) {
    return null;
  }
  return fs.readFile(filePath, 'utf8');
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  const content = await readTextIfExists(filePath);
  if (!content) {
    return null;
  }
  return JSON.parse(content) as T;
}

function withShopifyTags(source: string) {
  return source
    .replace(
      /{%\s*section\s+['"]([^'"]+)['"]\s*%}/g,
      "{% include 'sections/$1.liquid' %}"
    )
    .replace(
      /{%\s*render\s+['"]([^'"]+)['"](?:\s*,[\s\S]*?)?\s*%}/g,
      "{% include 'snippets/$1.liquid' %}"
    )
    .replace(/{%\s*schema\s*%}[\s\S]*?{%\s*endschema\s*%}/g, '')
    .replace(/{%\s*javascript\s*%}([\s\S]*?){%\s*endjavascript\s*%}/g, '<script>$1</script>')
    .replace(/{%\s*stylesheet\s*%}([\s\S]*?){%\s*endstylesheet\s*%}/g, '<style>$1</style>');
}

function createLiquid(themeName: string, themePath: string) {
  const liquid = new Liquid({
    root: themePath,
    extname: '.liquid',
    cache: false,
    strictFilters: false,
    strictVariables: false,
    lenientIf: true
  });

  const assetUrl = (value: unknown) =>
    `/themes/${encodeURIComponent(themeName)}/assets/${String(value || '')}`;

  liquid.registerFilter('asset_url', assetUrl);
  liquid.registerFilter('file_url', assetUrl);
  liquid.registerFilter('global_asset_url', assetUrl);
  liquid.registerFilter('shopify_asset_url', assetUrl);
  liquid.registerFilter('image_url', assetUrl);
  liquid.registerFilter('img_url', assetUrl);
  liquid.registerFilter('stylesheet_tag', (value) =>
    `<link rel="stylesheet" href="${String(value)}">`
  );
  liquid.registerFilter('script_tag', (value) =>
    `<script src="${String(value)}" defer></script>`
  );
  liquid.registerFilter('placeholder_svg_tag', (value) =>
    `<span class="cartify-placeholder-svg">${String(value || '')}</span>`
  );
  liquid.registerFilter('t', (value) => String(value || ''));
  liquid.registerFilter('money', (value) => String(value || ''));
  liquid.registerFilter('money_with_currency', (value) => String(value || ''));

  return liquid;
}

async function renderIndexContent(
  liquid: Liquid,
  themePath: string,
  settingsData: any
) {
  const indexJson = await readJsonIfExists<ShopifyTemplateJson>(
    path.join(themePath, 'templates', 'index.json')
  );
  if (indexJson?.sections && indexJson.order) {
    const sections = await Promise.all(
      indexJson.order.map(async (sectionId) => {
        const section = indexJson.sections?.[sectionId];
        if (!section?.type) {
          return '';
        }
        const sectionPath = path.join(
          themePath,
          'sections',
          `${section.type}.liquid`
        );
        const source = await readTextIfExists(sectionPath);
        if (!source) {
          return '';
        }
        return liquid.parseAndRender(withShopifyTags(source), {
          section: {
            id: sectionId,
            type: section.type,
            settings: section.settings || {},
            blocks: [],
            blocks_by_id: section.blocks || {}
          },
          settings: settingsData?.current || settingsData || {}
        });
      })
    );
    return sections.join('\n');
  }

  const indexLiquid = await readTextIfExists(
    path.join(themePath, 'templates', 'index.liquid')
  );
  if (indexLiquid) {
    const expandedTemplate = await expandLayoutSections(
      liquid,
      themePath,
      indexLiquid,
      settingsData
    );
    return liquid.parseAndRender(withShopifyTags(expandedTemplate), {
      settings: settingsData?.current || settingsData || {}
    });
  }

  return '<main class="cartify-preview-empty">Nenhum template de pagina inicial foi encontrado.</main>';
}

async function expandLayoutSections(
  liquid: Liquid,
  themePath: string,
  source: string,
  settingsData: any
) {
  const matches = [...source.matchAll(/{%\s*section\s+['"]([^'"]+)['"]\s*%}/g)];
  let expanded = source;
  for (const match of matches) {
    const sectionType = match[1];
    const sectionSource = await readTextIfExists(
      path.join(themePath, 'sections', `${sectionType}.liquid`)
    );
    if (!sectionSource) {
      expanded = expanded.replace(match[0], '');
      continue;
    }
    const sectionHtml = await liquid.parseAndRender(
      withShopifyTags(sectionSource),
      {
        section: {
          id: sectionType,
          type: sectionType,
          settings: {},
          blocks: [],
          blocks_by_id: {}
        },
        settings: settingsData?.current || settingsData || {}
      }
    );
    expanded = expanded.replace(match[0], sectionHtml);
  }
  return expanded;
}

export async function renderShopifyThemePreview(themeName: string) {
  const themePath = assertThemePath(themeName);
  const manifest = await readShopifyTheme(themePath);
  if (!manifest.valid) {
    throw new Error(manifest.errors.join(' '));
  }

  const liquid = createLiquid(themeName, themePath);
  const layoutSource = await readTextIfExists(
    path.join(themePath, 'layout', 'theme.liquid')
  );
  if (!layoutSource) {
    throw new Error('layout/theme.liquid not found.');
  }

  const contentForLayout = await renderIndexContent(
    liquid,
    themePath,
    manifest.settingsData
  );
  const expandedLayout = await expandLayoutSections(
    liquid,
    themePath,
    layoutSource,
    manifest.settingsData
  );
  const html = await liquid.parseAndRender(withShopifyTags(expandedLayout), {
    content_for_header: '<meta name="robots" content="noindex">',
    content_for_layout: contentForLayout,
    canonical_url: '/',
    request: { path: '/', page_type: 'index' },
    routes: { root_url: '/', cart_url: '/cart', all_products_collection_url: '/collections/all' },
    shop: {
      name: 'Cartify',
      domain: 'cartify.local',
      permanent_domain: 'cartify.local',
      url: '/'
    },
    settings: manifest.settingsData?.current || manifest.settingsData || {},
    localization: { language: { iso_code: 'pt-BR' }, country: { iso_code: 'BR' } },
    template: { name: 'index' }
  });

  return html;
}

export function getShopifyThemeAssetPath(themeName: string, assetName: string) {
  const themePath = assertThemePath(themeName);
  const assetPath = path.resolve(themePath, 'assets', assetName);
  const assetsRoot = path.resolve(themePath, 'assets');
  if (!assetPath.startsWith(assetsRoot + path.sep)) {
    throw new Error('Invalid asset path.');
  }
  return assetPath;
}
