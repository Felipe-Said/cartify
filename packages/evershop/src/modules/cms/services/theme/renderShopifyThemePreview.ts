import fs from 'fs/promises';
import path from 'path';
import { Liquid } from 'liquidjs';
import { CONSTANTS } from '../../../../lib/helpers.js';
import { parseShopifyJson } from '../../../../lib/shopify-theme/parseShopifyJson.js';
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

type RenderPreviewOptions = {
  template?: string;
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
  return parseShopifyJson<T>(content);
}

async function listFiles(rootPath: string) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        return listFiles(absolutePath);
      }
      return [absolutePath];
    })
  );
  return files.flat();
}

function withShopifyTags(source: string) {
  const liquidBlocks = source.replace(
    /{%-?\s*liquid\s*([\s\S]*?)\s*-?%}/g,
    (_match, statements: string) =>
      `{% liquid\n${statements.replace(
        /(^|\r?\n)(\s*)render(?=\s+)/g,
        '$1$2include'
      )}\n%}`
  );

  return liquidBlocks
    .replace(
      /{%-?\s*section\s+['"]([^'"]+)['"]\s*-?%}/g,
      "{% include 'sections/$1.liquid' %}"
    )
    // LiquidJS isolates all variables inside `render`, including Shopify
    // global objects such as settings, shop and routes. Include preserves the
    // context and still supports Shopify's named snippet arguments.
    .replace(
      /{%-?\s*render(\s+['"][^'"]+['"][\s\S]*?)\s*-?%}/g,
      '{% include$1 %}'
    )
    // Shopify's form tag is a server-side helper. A preview can preserve the
    // visual markup without attempting to submit to Shopify.
    .replace(
      /{%-?\s*form\s+[\s\S]*?-?%}/g,
      '<form action="#" method="post" data-cartify-preview-form>'
    )
    .replace(/{%-?\s*endform\s*-?%}/g, '</form>')
    // Paginate changes the available Shopify collection object. The preview
    // does not have catalogue data yet, but it can still render its contents.
    .replace(/{%-?\s*paginate\s+[\s\S]*?-?%}/g, '')
    .replace(/{%-?\s*endpaginate\s*-?%}/g, '')
    .replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/g, '')
    .replace(
      /{%-?\s*javascript\s*-?%}([\s\S]*?){%-?\s*endjavascript\s*-?%}/g,
      '<script>$1</script>'
    )
    .replace(
      /{%-?\s*stylesheet\s*-?%}([\s\S]*?){%-?\s*endstylesheet\s*-?%}/g,
      '<style>$1</style>'
    )
    .replace(
      /{%-?\s*style\s*-?%}([\s\S]*?){%-?\s*endstyle\s*-?%}/g,
      '<style data-shopify>$1</style>'
    );
}

async function prepareRenderableTheme(themeName: string, themePath: string) {
  const renderPath = path.join(
    CONSTANTS.CACHEPATH,
    'shopify-preview',
    themeName
  );
  await fs.rm(renderPath, { recursive: true, force: true });
  const files = await listFiles(themePath);
  await Promise.all(
    files.map(async (file) => {
      const relativePath = path.relative(themePath, file);
      const targetPath = path.join(renderPath, relativePath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      if (path.extname(file) === '.liquid') {
        const content = await fs.readFile(file, 'utf8');
        await fs.writeFile(targetPath, withShopifyTags(content));
        return;
      }
      // JSON templates and section groups describe the storefront structure.
      // They must accompany the transformed Liquid files in the render root.
      await fs.copyFile(file, targetPath);
    })
  );
  return renderPath;
}

function hexToRgb(value: string) {
  const hex = value.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }
  return {
    red: parseInt(hex.slice(0, 2), 16),
    green: parseInt(hex.slice(2, 4), 16),
    blue: parseInt(hex.slice(4, 6), 16),
    alpha: 1,
    rgb: value,
    hex: value
  };
}

function themeAssetUrl(themeName: string, assetName: string) {
  const encodedAsset = String(assetName || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/admin/themes/${encodeURIComponent(themeName)}/assets/${encodedAsset}`;
}

function normalizeShopifyValue(value: any): any {
  if (typeof value === 'string') {
    if (value.startsWith('#')) {
      return hexToRgb(value) || value;
    }
    if (value.startsWith('shopify://shop_images/')) {
      const filename = value.split('/').pop() || '';
      return {
        src: value,
        alt: '',
        width: 1600,
        height: 900,
        preview_image: { src: value },
        url: themeAssetUrl('__THEME__', filename)
      };
    }
    const fontMatch = value.match(/^(.+)_([ni])(\d)$/);
    if (fontMatch) {
      const family = fontMatch[1]
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      return {
        family,
        fallback_families: 'Arial, sans-serif',
        style: fontMatch[2] === 'i' ? 'italic' : 'normal',
        weight: Number(fontMatch[3]) * 100,
        system: true,
        'system?': true
      };
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeShopifyValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeShopifyValue(item)])
  );
}

function schemaDefaults(settingsSchema: any) {
  if (!Array.isArray(settingsSchema)) {
    return {};
  }
  return Object.fromEntries(
    settingsSchema
      .flatMap((group) => group?.settings || [])
      .filter((setting) => setting?.id && setting.default !== undefined)
      .map((setting) => [setting.id, setting.default])
  );
}

function normalizeSettings(
  settingsData: any,
  themeName: string,
  settingsSchema: any = []
) {
  const current = normalizeShopifyValue({
    ...schemaDefaults(settingsSchema),
    ...(settingsData?.current || settingsData || {})
  });
  if (current?.color_schemes && !Array.isArray(current.color_schemes)) {
    current.color_schemes = Object.entries(current.color_schemes).map(
      ([id, scheme]: [string, any]) => ({
        id,
        settings: scheme?.settings || {}
      })
    );
  }
  return JSON.parse(
    JSON.stringify(current).replaceAll(
      '/admin/themes/__THEME__/',
      `/admin/themes/${encodeURIComponent(themeName)}/`
    )
  );
}

function translationValue(translations: any, key: string) {
  return key.split('.').reduce((current, part) => current?.[part], translations);
}

async function loadTranslations(themePath: string) {
  const candidates = [
    'pt-BR.json',
    'pt-BR.default.json',
    'pt.json',
    'en.default.json',
    'en.json'
  ];
  for (const candidate of candidates) {
    const translations = await readJsonIfExists<any>(
      path.join(themePath, 'locales', candidate)
    );
    if (translations) {
      return translations;
    }
  }
  return {};
}

function createLiquid(themeName: string, themePath: string, translations: any) {
  const liquid = new Liquid({
    root: [
      themePath,
      path.join(themePath, 'snippets'),
      path.join(themePath, 'sections')
    ],
    extname: '.liquid',
    cache: false,
    strictFilters: false,
    strictVariables: false,
    lenientIf: true
  });

  const assetUrl = (value: any) => {
    if (
      typeof value === 'string' &&
      (value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://'))
    ) {
      return value;
    }
    if (typeof value === 'string' && value.startsWith('shopify://shop_images/')) {
      const filename = value.split('/').pop() || '';
      return themeAssetUrl(themeName, filename);
    }
    if (value?.url) {
      return String(value.url);
    }
    if (value?.src && String(value.src).startsWith('shopify://shop_images/')) {
      const filename = String(value.src).split('/').pop() || '';
      return themeAssetUrl(themeName, filename);
    }
    return themeAssetUrl(themeName, String(value || ''));
  };

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
    `<svg class="placeholder-svg" viewBox="0 0 1600 900" role="img" aria-label="${String(value || 'Imagem')}"><rect width="1600" height="900" fill="#e8e8e8"/><path d="M0 720 420 330l310 290 210-190 660 470H0Z" fill="#d2d2d2"/></svg>`
  );
  liquid.registerFilter('image_tag', (value, options: any = {}) => {
    const src = assetUrl(value);
    const alt = String(options?.alt || value?.alt || '');
    const loading = String(options?.loading || 'lazy');
    const className = options?.class ? ` class="${String(options.class)}"` : '';
    return `<img src="${src}" alt="${alt}" loading="${loading}"${className}>`;
  });
  liquid.registerFilter('video_tag', (value, options: any = {}) => {
    const src = assetUrl(value?.url || value?.sources?.[0]?.url || value);
    const autoplay = options?.autoplay ? ' autoplay' : '';
    const loop = options?.loop ? ' loop' : '';
    const muted = options?.muted === false ? '' : ' muted';
    const controls = options?.controls === false ? '' : ' controls';
    return `<video src="${src}"${autoplay}${loop}${muted}${controls}></video>`;
  });
  liquid.registerFilter('external_video_url', (value) =>
    String(value?.external_id || value?.url || value || '')
  );
  liquid.registerFilter('external_video_tag', (value) =>
    `<iframe src="${String(value || '')}" loading="lazy" allowfullscreen></iframe>`
  );
  liquid.registerFilter('font_url', () => '');
  liquid.registerFilter('font_face', () => '');
  liquid.registerFilter('font_modify', (value) => value);
  liquid.registerFilter('t', (value) => {
    const key = String(value || '');
    const translated = translationValue(translations, key);
    return typeof translated === 'string' ? translated : key;
  });
  liquid.registerFilter('money', (value) => String(value || ''));
  liquid.registerFilter('money_with_currency', (value) => String(value || ''));

  return liquid;
}

async function compileLiquidAssets(
  liquid: Liquid,
  renderPath: string,
  settings: any
) {
  const assetsPath = path.join(renderPath, 'assets');
  if (!(await exists(assetsPath))) {
    return;
  }
  const files = await listFiles(assetsPath);
  await Promise.all(
    files
      .filter((file) => /\.(css|js|svg)\.liquid$/i.test(file))
      .map(async (file) => {
        const source = await fs.readFile(file, 'utf8');
        const rendered = await liquid.parseAndRender(source, { settings });
        await fs.writeFile(file.replace(/\.liquid$/i, ''), rendered);
      })
  );
}

async function renderSectionConfig(
  liquid: Liquid,
  themePath: string,
  sectionId: string,
  section: ShopifySectionConfig,
  settings: any
) {
  if (!section.type) {
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
  const blocksById = section.blocks || {};
  const orderedBlocks = (section.block_order || Object.keys(blocksById))
    .map((id) => ({
      id,
      ...(blocksById[id] as Record<string, unknown>),
      settings: normalizeSettings(
        { current: (blocksById[id] as any)?.settings || {} },
        path.basename(themePath)
      )
    }))
    .filter((block: any) => !block.disabled);

  return liquid.parseAndRender(source, {
    section: {
      id: sectionId,
      type: section.type,
      settings: normalizeSettings(
        { current: section.settings || {} },
        path.basename(themePath)
      ),
      blocks: orderedBlocks,
      blocks_by_id: blocksById
    },
    settings
  });
}

async function renderIndexContent(
  liquid: Liquid,
  themePath: string,
  settings: any,
  template = 'index'
) {
  const templateName = template
    .replace(/^templates\//, '')
    .replace(/\.(json|liquid)$/i, '');
  const templateJson = await readJsonIfExists<ShopifyTemplateJson>(
    path.join(themePath, 'templates', `${templateName}.json`)
  );
  if (templateJson?.sections && templateJson.order) {
    const sections = await Promise.all(
      templateJson.order.map(async (sectionId) => {
        const section = templateJson.sections?.[sectionId];
        if (!section) {
          return '';
        }
        return renderSectionConfig(liquid, themePath, sectionId, section, settings);
      })
    );
    return sections.join('\n');
  }

  const templateLiquid = await readTextIfExists(
    path.join(themePath, 'templates', `${templateName}.liquid`)
  );
  if (templateLiquid) {
    const expandedTemplate = await expandLayoutSections(
      liquid,
      themePath,
      templateLiquid,
      settings
    );
    return liquid.parseAndRender(withShopifyTags(expandedTemplate), {
      settings
    });
  }

  return '<main class="cartify-preview-empty">Nenhum template de pagina inicial foi encontrado.</main>';
}

async function expandLayoutSections(
  liquid: Liquid,
  themePath: string,
  source: string,
  settings: any
) {
  const matches = [...source.matchAll(/{%-?\s*section\s+['"]([^'"]+)['"]\s*-?%}/g)];
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
        settings
      }
    );
    expanded = expanded.replace(match[0], sectionHtml);
  }
  return expanded;
}

async function expandSectionGroups(
  liquid: Liquid,
  themePath: string,
  source: string,
  settings: any
) {
  const matches = [...source.matchAll(/{%-?\s*sections\s+['"]([^'"]+)['"]\s*-?%}/g)];
  let expanded = source;
  for (const match of matches) {
    const groupName = match[1];
    const group = await readJsonIfExists<ShopifyTemplateJson>(
      path.join(themePath, 'sections', `${groupName}.json`)
    );
    if (!group?.sections || !group.order) {
      expanded = expanded.replace(match[0], '');
      continue;
    }
    const html = await Promise.all(
      group.order.map(async (sectionId) => {
        const section = group.sections?.[sectionId];
        if (!section) {
          return '';
        }
        return renderSectionConfig(liquid, themePath, sectionId, section, settings);
      })
    );
    expanded = expanded.replace(match[0], html.join('\n'));
  }
  return expanded;
}

export async function renderShopifyThemePreview(
  themeName: string,
  options: RenderPreviewOptions = {}
) {
  const themePath = assertThemePath(themeName);
  const manifest = await readShopifyTheme(themePath);
  if (!manifest.valid) {
    throw new Error(manifest.errors.join(' '));
  }

  const renderPath = await prepareRenderableTheme(themeName, themePath);
  const settings = normalizeSettings(
    manifest.settingsData,
    themeName,
    manifest.settingsSchema
  );
  const translations = await loadTranslations(renderPath);
  const liquid = createLiquid(themeName, renderPath, translations);
  await compileLiquidAssets(liquid, renderPath, settings);
  const template = options.template || 'index';
  const layoutSource = await readTextIfExists(
    path.join(renderPath, 'layout', 'theme.liquid')
  );
  if (!layoutSource) {
    throw new Error('layout/theme.liquid not found.');
  }

  const contentForLayout = await renderIndexContent(
    liquid,
    renderPath,
    settings,
    template
  );
  const expandedLayout = await expandLayoutSections(
    liquid,
    renderPath,
    layoutSource,
    settings
  );
  const expandedGroups = await expandSectionGroups(
    liquid,
    renderPath,
    expandedLayout,
    settings
  );
  const html = await liquid.parseAndRender(expandedGroups, {
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
    settings,
    localization: { language: { iso_code: 'pt-BR' }, country: { iso_code: 'BR' } },
    template: { name: template.replace(/^templates\//, '').replace(/\.(json|liquid)$/i, '') },
    page_title: 'Cartify',
    page_description: '',
    current_tags: [],
    current_page: 1
  });

  return html;
}

export async function getShopifyThemeAssetPath(
  themeName: string,
  assetName: string
) {
  const themePath = assertThemePath(themeName);
  const assetPath = path.resolve(themePath, 'assets', assetName);
  const assetsRoot = path.resolve(themePath, 'assets');
  if (!assetPath.startsWith(assetsRoot + path.sep)) {
    throw new Error('Invalid asset path.');
  }
  const cacheAssetsRoot = path.resolve(
    CONSTANTS.CACHEPATH,
    'shopify-preview',
    themeName,
    'assets'
  );
  const cachedAssetPath = path.resolve(cacheAssetsRoot, assetName);
  if (!cachedAssetPath.startsWith(cacheAssetsRoot + path.sep)) {
    throw new Error('Invalid cached asset path.');
  }
  if (await exists(cachedAssetPath)) {
    return cachedAssetPath;
  }
  return assetPath;
}
