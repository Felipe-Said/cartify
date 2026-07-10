import fs from 'fs/promises';
import path from 'path';
import { CONSTANTS } from '../../../../lib/helpers.js';
import { readShopifyTheme } from '../../../../lib/shopify-theme/readShopifyTheme.js';
import { getConfig } from '../../../../lib/util/getConfig.js';

export type StoreTheme = {
  name: string;
  label: string;
  version: string;
  role: 'main' | 'unpublished';
  engine: 'cartify' | 'shopify_liquid';
  status: 'ready' | 'needs_adapter' | 'invalid';
  lastSavedAt: string | null;
  fileCount: number;
  templateCount: number;
  sectionCount: number;
  localeCount: number;
  templates: string[];
  sections: string[];
  snippets: string[];
  locales: string[];
  errors: string[];
  warnings: string[];
};

function getDefaultTheme(): StoreTheme {
  return {
    name: 'cartify-default',
    label: 'Cartify Default',
    version: '1.0.0',
    role: 'main',
    engine: 'cartify',
    status: 'ready',
    lastSavedAt: null,
    fileCount: 0,
    templateCount: 0,
    sectionCount: 0,
    localeCount: 0,
    templates: [],
    sections: [],
    snippets: [],
    locales: [],
    errors: [],
    warnings: []
  };
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackage(themePath: string) {
  const packagePath = path.join(themePath, 'package.json');
  if (!(await exists(packagePath))) {
    return {};
  }
  try {
    return JSON.parse(await fs.readFile(packagePath, 'utf8'));
  } catch {
    return {};
  }
}

async function readTheme(themeName: string): Promise<StoreTheme | null> {
  const themePath = path.join(CONSTANTS.THEMEPATH, themeName);
  const stats = await fs.stat(themePath);
  if (!stats.isDirectory()) {
    return null;
  }

  const activeTheme = getConfig('system.theme') as string | undefined;
  const pkg = await readPackage(themePath);
  const hasShopifyLayout = await exists(
    path.join(themePath, 'layout', 'theme.liquid')
  );
  const hasCartifySource = await exists(path.join(themePath, 'src'));
  const hasCartifyBuild = await exists(path.join(themePath, 'dist'));

  if (hasShopifyLayout) {
    const manifest = await readShopifyTheme(themePath);
    return {
      name: themeName,
      label: pkg.name || themeName,
      version: pkg.version || '1.0.0',
      role: activeTheme === themeName ? 'main' : 'unpublished',
      engine: 'shopify_liquid',
      status: manifest.valid ? 'needs_adapter' : 'invalid',
      lastSavedAt: stats.mtime.toISOString(),
      fileCount: manifest.files.length,
      templateCount: manifest.templates.length,
      sectionCount: manifest.sections.length,
      localeCount: manifest.locales.length,
      templates: manifest.templates,
      sections: manifest.sections,
      snippets: manifest.snippets,
      locales: manifest.locales,
      errors: manifest.errors,
      warnings: manifest.warnings
    };
  }

  return {
    name: themeName,
    label: pkg.name || themeName,
    version: pkg.version || '1.0.0',
    role: activeTheme === themeName ? 'main' : 'unpublished',
    engine: 'cartify',
    status: hasCartifySource || hasCartifyBuild ? 'ready' : 'invalid',
    lastSavedAt: stats.mtime.toISOString(),
    fileCount: 0,
    templateCount: 0,
    sectionCount: 0,
    localeCount: 0,
    templates: [],
    sections: [],
    snippets: [],
    locales: [],
    errors: hasCartifySource || hasCartifyBuild ? [] : ['Theme source not found.'],
    warnings: []
  };
}

export async function listStoreThemes(): Promise<StoreTheme[]> {
  if (!(await exists(CONSTANTS.THEMEPATH))) {
    return [getDefaultTheme()];
  }

  const entries = await fs.readdir(CONSTANTS.THEMEPATH, {
    withFileTypes: true
  });
  const themes = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readTheme(entry.name))
  );

  const storeThemes = themes
    .filter((theme): theme is StoreTheme => !!theme)
    .sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === 'main' ? -1 : 1;
      }
      return a.label.localeCompare(b.label);
    });

  if (storeThemes.length === 0) {
    return [getDefaultTheme()];
  }

  if (!storeThemes.some((theme) => theme.role === 'main')) {
    return [{ ...getDefaultTheme(), role: 'main' }, ...storeThemes];
  }

  return storeThemes;
}
