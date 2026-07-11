import fs from 'fs/promises';
import path from 'path';
import { CONSTANTS } from '../../../../lib/helpers.js';
import { parseShopifyJson } from '../../../../lib/shopify-theme/parseShopifyJson.js';

type ThemeSetting = Record<string, any>;

type ThemeSchema = {
  name?: string;
  settings?: ThemeSetting[];
  blocks?: Array<{
    type?: string;
    name?: string;
    settings?: ThemeSetting[];
  }>;
  presets?: Array<{ name?: string }>;
};

type ThemeTemplate = {
  sections?: Record<string, any>;
  order?: string[];
  [key: string]: any;
};

function themePath(themeName: string) {
  const root = path.resolve(CONSTANTS.THEMEPATH);
  const target = path.resolve(root, themeName);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid theme path.');
  }
  return target;
}

function safeTemplatePath(template: string) {
  const normalized = String(template || 'templates/index.json').replace(/\\/g, '/');
  if (!normalized.startsWith('templates/') || normalized.includes('..')) {
    throw new Error('Invalid theme template.');
  }
  return normalized;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return parseShopifyJson<T>(await fs.readFile(filePath, 'utf8'));
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

function translationValue(translations: any, key: string) {
  return key.split('.').reduce((current, part) => current?.[part], translations);
}

function localize(value: any, translations: any) {
  if (typeof value !== 'string' || !value.startsWith('t:')) {
    return value;
  }
  const translated = translationValue(translations, value.slice(2));
  return typeof translated === 'string' ? translated : value;
}

function localizeSchema(schema: ThemeSchema, translations: any): ThemeSchema {
  return {
    ...schema,
    name: localize(schema.name, translations),
    settings: (schema.settings || []).map((setting) => ({
      ...setting,
      label: localize(setting.label, translations),
      info: localize(setting.info, translations),
      content: localize(setting.content, translations),
      options: (setting.options || []).map((option) => ({
        ...option,
        label: localize(option.label, translations)
      }))
    })),
    blocks: (schema.blocks || []).map((block) => ({
      ...block,
      name: localize(block.name, translations),
      settings: (block.settings || []).map((setting) => ({
        ...setting,
        label: localize(setting.label, translations),
        info: localize(setting.info, translations),
        content: localize(setting.content, translations),
        options: (setting.options || []).map((option) => ({
          ...option,
          label: localize(option.label, translations)
        }))
      }))
    }))
  };
}

async function loadEditorTranslations(rootPath: string) {
  for (const locale of [
    'pt-BR.json',
    'pt-BR.default.json',
    'pt.json',
    'en.default.json',
    'en.json'
  ]) {
    const translations = await readJson<any>(
      path.join(rootPath, 'locales', locale),
      null
    );
    if (translations) {
      return translations;
    }
  }
  return {};
}

async function readSectionSchema(
  rootPath: string,
  type: string,
  translations: any
) {
  const source = await fs.readFile(
    path.join(rootPath, 'sections', `${type}.liquid`),
    'utf8'
  );
  const match = source.match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/);
  if (!match) {
    return null;
  }
  try {
    return localizeSchema(
      parseShopifyJson<ThemeSchema>(match[1].trim()),
      translations
    );
  } catch {
    return null;
  }
}

function normalizeSchema(schema: ThemeSchema | null, fallbackName: string) {
  return {
    name: schema?.name || fallbackName,
    settings: schema?.settings || [],
    blocks: schema?.blocks || [],
    presets: schema?.presets || []
  };
}

async function listSectionTypes(rootPath: string, translations: any) {
  const directory = path.join(rootPath, 'sections');
  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.liquid'))
      .map(async (entry) => {
        const type = entry.name.replace(/\.liquid$/, '');
        const schema = await readSectionSchema(rootPath, type, translations);
        if (!schema?.presets?.length) {
          return null;
        }
        return {
          type,
          ...normalizeSchema(schema, type)
        };
      })
  ).then((sections) => sections.filter(Boolean));
}

function editorSection(id: string, section: any, schema: ThemeSchema | null) {
  return {
    id,
    type: section.type,
    disabled: Boolean(section.disabled),
    settings: section.settings || {},
    blocks: Object.entries(section.blocks || {}).map(([blockId, block]: [string, any]) => ({
      id: blockId,
      type: block.type,
      disabled: Boolean(block.disabled),
      settings: block.settings || {}
    })),
    blockOrder: section.block_order || Object.keys(section.blocks || {}),
    schema: normalizeSchema(schema, section.type)
  };
}

export async function getShopifyThemeEditor(themeName: string, template?: string) {
  const rootPath = themePath(themeName);
  const translations = await loadEditorTranslations(rootPath);
  const selectedTemplate = safeTemplatePath(template || 'templates/index.json');
  if (!selectedTemplate.endsWith('.json')) {
    throw new Error('Only JSON templates can be edited visually.');
  }

  const [templateData, settingsData, settingsSchema] = await Promise.all([
    readJson<ThemeTemplate>(path.join(rootPath, selectedTemplate), {}),
    readJson<any>(path.join(rootPath, 'config', 'settings_data.json'), {}),
    readJson<ThemeSchema[]>(path.join(rootPath, 'config', 'settings_schema.json'), [])
  ]);
  const sections = await Promise.all(
    Object.entries(templateData.sections || {}).map(async ([id, section]) =>
      editorSection(
        id,
        section,
        await readSectionSchema(rootPath, section.type, translations)
      )
    )
  );

  return {
    template: selectedTemplate,
    templateData,
    global: {
      settings: settingsData.current || {},
      schema: settingsSchema
        .filter((group) => Array.isArray(group.settings))
        .map((group) => localizeSchema(group, translations))
    },
    sections: (templateData.order || []).map((id) => sections.find((section) => section.id === id)).filter(Boolean),
    availableSections: await listSectionTypes(rootPath, translations)
  };
}

export async function saveShopifyThemeEditor(
  themeName: string,
  template: string,
  templateData: ThemeTemplate,
  globalSettings: Record<string, any>
) {
  const rootPath = themePath(themeName);
  const selectedTemplate = safeTemplatePath(template);
  if (!selectedTemplate.endsWith('.json')) {
    throw new Error('Only JSON templates can be edited visually.');
  }
  if (!templateData || typeof templateData !== 'object') {
    throw new Error('Invalid template data.');
  }
  if (!globalSettings || typeof globalSettings !== 'object') {
    throw new Error('Invalid theme settings.');
  }

  const settingsPath = path.join(rootPath, 'config', 'settings_data.json');
  const currentSettingsData = await readJson<any>(settingsPath, {});
  const nextSettingsData = { ...currentSettingsData, current: globalSettings };
  const templatePath = path.join(rootPath, selectedTemplate);

  await Promise.all([
    fs.writeFile(`${settingsPath}.tmp`, `${JSON.stringify(nextSettingsData, null, 2)}\n`),
    fs.writeFile(`${templatePath}.tmp`, `${JSON.stringify(templateData, null, 2)}\n`)
  ]);
  await Promise.all([
    fs.rename(`${settingsPath}.tmp`, settingsPath),
    fs.rename(`${templatePath}.tmp`, templatePath)
  ]);
}

export async function uploadShopifyThemeMedia(
  themeName: string,
  file: { originalname?: string; mimetype?: string; buffer?: Buffer }
) {
  if (!file?.buffer || !file.originalname) {
    throw new Error('Nenhum arquivo foi enviado.');
  }
  if (!file.mimetype?.startsWith('image/') && !file.mimetype?.startsWith('video/')) {
    throw new Error('Envie uma imagem ou um video.');
  }
  const rootPath = themePath(themeName);
  const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '-');
  const filename = `${Date.now()}-${safeName}`;
  const assetDirectory = path.join(rootPath, 'assets');
  await fs.mkdir(assetDirectory, { recursive: true });
  await fs.writeFile(path.join(assetDirectory, filename), file.buffer);
  return {
    filename,
    path: `/admin/themes/${encodeURIComponent(themeName)}/assets/${encodeURIComponent(filename)}`
  };
}
