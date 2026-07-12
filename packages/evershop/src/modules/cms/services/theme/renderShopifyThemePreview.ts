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
  templateData?: ShopifyTemplateJson;
  globalSettings?: Record<string, unknown>;
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
    (_match, statements: string) => `{% liquid\n${statements}\n%}`
  );

  return liquidBlocks
    .replace(
      /{%-?\s*section\s+['"]([^'"]+)['"]\s*-?%}/g,
      "{% include 'sections/$1.liquid' %}"
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
        const schemaMatch = content.match(
          /{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/
        );
        if (
          schemaMatch &&
          path.dirname(relativePath).replace(/\\/g, '/') === 'sections'
        ) {
          try {
            const schema = parseShopifyJson<any>(schemaMatch[1]);
            await fs.writeFile(`${targetPath}.schema.json`, JSON.stringify(schema));
          } catch {
            // Invalid schema metadata must not prevent the theme preview.
          }
        }
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
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const color = {
    red,
    green,
    blue,
    alpha: 1,
    rgb: `${red} ${green} ${blue}`,
    hex: value
  };
  Object.defineProperty(color, 'toString', {
    enumerable: false,
    value: () => value
  });
  return color;
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
      return '';
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

function shopifyResourceUrl(value: string) {
  const match = value.match(/^shopify:\/\/(products|collections|pages|blogs)\/(.+)$/);
  if (!match) return value;
  return `/${match[1]}/${match[2]}`;
}

function fallbackMenu(handle: string) {
  const links = [
    { title: 'Home', url: '/', handle: 'home' },
    { title: 'Catalog', url: '/collections/all', handle: 'catalog' },
    { title: 'Contact', url: '/pages/contact', handle: 'contact' }
  ].map((link) => ({
    ...link,
    active: false,
    child_active: false,
    current: false,
    child_current: false,
    levels: 0,
    links: []
  }));
  return { handle, title: handle, levels: 1, links };
}

function settingDefinitions(schema: any) {
  const groups = Array.isArray(schema) ? schema : [];
  const settings = groups.some((item) => Array.isArray(item?.settings))
    ? groups.flatMap((item) => item?.settings || [])
    : groups;
  return new Map(
    settings.filter((item) => item?.id).map((item) => [item.id, item])
  );
}

function normalizeSettingValue(value: any, definition: any) {
  const type = definition?.type;
  if (type === 'image_picker' && typeof value === 'string' && value.startsWith('shopify://')) {
    return '';
  }
  if (
    ['product', 'collection', 'page', 'blog'].includes(type) &&
    typeof value === 'string'
  ) {
    return null;
  }
  if (type === 'link_list' && typeof value === 'string') {
    return value.trim() ? fallbackMenu(value) : null;
  }
  if (type === 'url' && typeof value === 'string') {
    return shopifyResourceUrl(value);
  }
  return normalizeShopifyValue(value);
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

function replaceThemeToken(value: any, themeName: string): any {
  if (typeof value === 'string') {
    return value.replaceAll(
      '/admin/themes/__THEME__/',
      `/admin/themes/${encodeURIComponent(themeName)}/`
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceThemeToken(item, themeName));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (typeof value.hex === 'string' && value.rgb !== undefined) {
    return hexToRgb(value.hex) || value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      replaceThemeToken(item, themeName)
    ])
  );
}

function normalizeSettings(
  settingsData: any,
  themeName: string,
  settingsSchema: any = []
) {
  const definitions = settingDefinitions(settingsSchema);
  const raw = {
    ...Object.fromEntries(
      [...definitions.entries()].map(([id, definition]: [string, any]) => [
        id,
        definition.default === undefined ? null : definition.default
      ])
    ),
    ...(settingsData?.current || settingsData || {})
  };
  const current = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      normalizeSettingValue(value, definitions.get(key))
    ])
  );
  if (current?.color_schemes && !Array.isArray(current.color_schemes)) {
    current.color_schemes = Object.entries(current.color_schemes).map(
      ([id, scheme]: [string, any]) => ({
        id,
        settings: scheme?.settings || {}
      })
    );
  }
  return replaceThemeToken(current, themeName);
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
    root: themePath,
    partials: path.join(themePath, 'snippets'),
    layouts: path.join(themePath, 'layout'),
    relativeReference: false,
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
  liquid.registerFilter('placeholder_svg_tag', (value, className = 'placeholder-svg') =>
    `<svg class="${String(className || 'placeholder-svg')} placeholder-svg" viewBox="0 0 1600 900" role="img" aria-label="${String(value || 'Imagem')}"><rect width="1600" height="900" fill="#e8e8e8"/><path d="M0 720 420 330l310 290 210-190 660 470H0Z" fill="#d2d2d2"/></svg>`
  );
  liquid.registerFilter('image_tag', (value, options: any = {}) => {
    const src = assetUrl(value);
    const alt = String(options?.alt || value?.alt || '');
    const loading = String(options?.loading || 'lazy');
    const attributes: string[] = [
      `src="${src}"`,
      `alt="${alt}"`,
      `loading="${loading}"`
    ];
    const attributeMap: Record<string, string> = {
      class: 'class',
      sizes: 'sizes',
      style: 'style',
      id: 'id',
      fetchpriority: 'fetchpriority',
      draggable: 'draggable'
    };
    Object.entries(attributeMap).forEach(([option, attribute]) => {
      if (options?.[option] !== undefined && options?.[option] !== '') {
        attributes.push(`${attribute}="${String(options[option])}"`);
      }
    });
    const width = Number(options?.width || value?.width || 0);
    const height = Number(options?.height || value?.height || 0);
    if (width > 0) attributes.push(`width="${width}"`);
    if (height > 0) attributes.push(`height="${height}"`);
    if (options?.widths) {
      const widths = String(options.widths)
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => item > 0);
      if (widths.length > 0) {
        attributes.push(
          `srcset="${widths.map((item) => `${src} ${item}w`).join(', ')}"`
        );
      }
    }
    return `<img ${attributes.join(' ')}>`;
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
  settings: any,
  groupName?: string
) {
  if (!section.type || (section as any).disabled) {
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
  const presentation = await readJsonIfExists<{
    tag?: string;
    class?: string;
    settings?: any[];
    blocks?: Array<{ type?: string; settings?: any[] }>;
  }>(`${sectionPath}.schema.json`);
  const blocksById = section.blocks || {};
  const orderedBlocks = (section.block_order || Object.keys(blocksById))
    .map((id) => ({
      id,
      ...(blocksById[id] as Record<string, unknown>),
      shopify_attributes: `data-shopify-editor-block='${JSON.stringify({
        id,
        type: (blocksById[id] as any)?.type || ''
      })}'`,
      settings: normalizeSettings(
        { current: (blocksById[id] as any)?.settings || {} },
        path.basename(themePath),
        presentation?.blocks?.find(
          (item) => item.type === (blocksById[id] as any)?.type
        )?.settings || []
      )
    }))
    .filter((block: any) => !block.disabled);

  const sectionObject = {
    id: sectionId,
    type: section.type,
    settings: normalizeSettings(
      { current: section.settings || {} },
      path.basename(themePath),
      presentation?.settings || []
    ),
    blocks: orderedBlocks,
    blocks_by_id: blocksById,
    shopify_attributes: `data-shopify-editor-section='${JSON.stringify({
      id: sectionId,
      type: section.type
    })}'`
  };
  const html = await liquid.parseAndRender(source, {
    section: sectionObject,
    settings
  });
  const groupClass = groupName
    ? ` shopify-section-group-${groupName.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    : '';
  const allowedTags = new Set(['div', 'section', 'header', 'footer', 'aside']);
  const wrapperTag =
    presentation?.tag && allowedTags.has(presentation.tag)
      ? presentation.tag
      : 'div';
  const sectionClass = presentation?.class
    ? ` ${presentation.class.replace(/[^a-zA-Z0-9 _-]/g, '')}`
    : '';
  return `<${wrapperTag} id="shopify-section-${sectionId}" class="shopify-section${groupClass}${sectionClass}" data-section-type="${section.type}">${html}</${wrapperTag}>`;
}

async function renderIndexContent(
  liquid: Liquid,
  themePath: string,
  settings: any,
  template = 'index',
  templateOverride?: ShopifyTemplateJson
) {
  const templateName = template
    .replace(/^templates\//, '')
    .replace(/\.(json|liquid)$/i, '');
  const templateJson =
    templateOverride ||
    (await readJsonIfExists<ShopifyTemplateJson>(
      path.join(themePath, 'templates', `${templateName}.json`)
    ));
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
    const sectionHtml = await renderSectionConfig(
      liquid,
      themePath,
      sectionType,
      { type: sectionType, settings: {}, blocks: {}, block_order: [] },
      settings
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
        return renderSectionConfig(
          liquid,
          themePath,
          sectionId,
          section,
          settings,
          groupName
        );
      })
    );
    expanded = expanded.replace(match[0], html.join('\n'));
  }
  return expanded;
}

function createRuntimeContext(template: string, settings: any) {
  const templateName = template
    .replace(/^templates\//, '')
    .replace(/\.(json|liquid)$/i, '');
  const templateObject = { name: templateName };
  Object.defineProperty(templateObject, 'toString', {
    enumerable: false,
    value: () => templateName
  });
  return {
    canonical_url: '/',
    request: {
      path: '/',
      page_type: 'index',
      design_mode: true,
      locale: { iso_code: 'pt-BR' }
    },
    routes: {
      root_url: '/',
      cart_url: '/cart',
      cart_add_url: '/cart/add.js',
      cart_change_url: '/cart/change.js',
      cart_update_url: '/cart/update.js',
      search_url: '/search',
      account_url: '/account',
      account_login_url: '/account/login',
      account_logout_url: '/account/logout',
      account_register_url: '/account/register',
      account_addresses_url: '/account/addresses',
      collections_url: '/collections',
      all_products_collection_url: '/collections/all'
    },
    cart: {
      item_count: 0,
      items: [],
      empty: true,
      total_price: 0,
      original_total_price: 0,
      total_discount: 0,
      cart_level_discount_applications: [],
      taxes_included: false,
      note: '',
      attributes: {},
      currency: { iso_code: 'BRL', symbol: 'R$' }
    },
    shop: {
      name: 'Cartify',
      domain: 'cartify.local',
      permanent_domain: 'cartify.local',
      secure_url: '/',
      url: '/',
      customer_accounts_enabled: false,
      enabled_payment_types: [],
      shipping_policy: { body: '', url: '/policies/shipping-policy' },
      refund_policy: { body: '', url: '/policies/refund-policy' },
      privacy_policy: { body: '', url: '/policies/privacy-policy' },
      terms_of_service: { body: '', url: '/policies/terms-of-service' },
      brand: { metafields: { social_links: {} } },
      features: { follow_on_shop: false, 'follow_on_shop?': false },
      metafields: {}
    },
    settings,
    localization: {
      language: { iso_code: 'pt-BR' },
      country: { iso_code: 'BR' }
    },
    template: templateObject,
    page_title: 'Cartify',
    page_description: '',
    current_tags: [],
    current_page: 1
  };
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
  if (options.globalSettings) {
    Object.assign(settings, normalizeShopifyValue(options.globalSettings));
  }
  const translations = await loadTranslations(renderPath);
  const liquid = createLiquid(themeName, renderPath, translations);
  await compileLiquidAssets(liquid, renderPath, settings);
  const template = options.template || 'index';
  const runtimeContext = createRuntimeContext(template, settings);
  liquid.options.globals = runtimeContext;
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
    template,
    options.templateData
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
  const editorRuntime = `
    <meta name="robots" content="noindex">
    <script>
      (() => {
        window.Shopify = window.Shopify || {};
        window.Shopify.routes = { root: '/' };
        window.Shopify.designMode = true;
        window.Shopify.currency = { active: 'BRL', rate: '1.0' };
        document.addEventListener('click', (event) => {
          const link = event.target instanceof Element
            ? event.target.closest('a[href]')
            : null;
          if (!link) return;
          const href = link.getAttribute('href') || '';
          if (href.startsWith('#')) return;
          event.preventDefault();
        });
      })();
    </script>`;
  const html = await liquid.parseAndRender(expandedGroups, {
    ...runtimeContext,
    content_for_header: editorRuntime,
    content_for_layout: contentForLayout,
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
