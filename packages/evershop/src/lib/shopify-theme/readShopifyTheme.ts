import fs from 'fs/promises';
import path from 'path';
import { parseShopifyJson } from './parseShopifyJson.js';

export const SHOPIFY_THEME_DIRECTORIES = [
  'assets',
  'blocks',
  'config',
  'layout',
  'locales',
  'sections',
  'snippets',
  'templates'
] as const;

export type ShopifyThemeDirectory =
  (typeof SHOPIFY_THEME_DIRECTORIES)[number];

export type ShopifyThemeFile = {
  directory: ShopifyThemeDirectory;
  relativePath: string;
  absolutePath: string;
  extension: string;
};

export type ShopifyThemeManifest = {
  rootPath: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  files: ShopifyThemeFile[];
  templates: string[];
  sections: string[];
  snippets: string[];
  locales: string[];
  settingsSchema: unknown | null;
  settingsData: unknown | null;
};

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(
  rootPath: string,
  directory: ShopifyThemeDirectory
): Promise<ShopifyThemeFile[]> {
  const absoluteDirectory = path.join(rootPath, directory);
  if (!(await exists(absoluteDirectory))) {
    return [];
  }

  const entries = await fs.readdir(absoluteDirectory, {
    withFileTypes: true
  });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const relativePath = path.join(directory, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        return listNestedFiles(rootPath, absolutePath, relativePath, directory);
      }
      if (!entry.isFile()) {
        return [];
      }
      return [
        {
          directory,
          relativePath,
          absolutePath,
          extension: path.extname(entry.name).replace('.', '').toLowerCase()
        }
      ];
    })
  );

  return files.flat();
}

async function listNestedFiles(
  rootPath: string,
  absoluteDirectory: string,
  relativeDirectory: string,
  directory: ShopifyThemeDirectory
): Promise<ShopifyThemeFile[]> {
  const entries = await fs.readdir(absoluteDirectory, {
    withFileTypes: true
  });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const relativePath = path
        .relative(rootPath, absolutePath)
        .replace(/\\/g, '/');
      if (entry.isDirectory()) {
        return listNestedFiles(rootPath, absolutePath, relativePath, directory);
      }
      if (!entry.isFile()) {
        return [];
      }
      return [
        {
          directory,
          relativePath,
          absolutePath,
          extension: path.extname(entry.name).replace('.', '').toLowerCase()
        }
      ];
    })
  );

  return files.flat();
}

async function readJsonIfExists(filePath: string) {
  if (!(await exists(filePath))) {
    return null;
  }
  const content = await fs.readFile(filePath, 'utf8');
  return parseShopifyJson(content);
}

export async function readShopifyTheme(
  themePath: string
): Promise<ShopifyThemeManifest> {
  const rootPath = path.resolve(themePath);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!(await exists(rootPath))) {
    errors.push(`Theme path does not exist: ${rootPath}`);
  }

  const files = (
    await Promise.all(
      SHOPIFY_THEME_DIRECTORIES.map((directory) =>
        listFiles(rootPath, directory)
      )
    )
  ).flat();

  const hasThemeLayout = files.some(
    (file) => file.relativePath === 'layout/theme.liquid'
  );
  if (!hasThemeLayout) {
    errors.push('Shopify themes must include layout/theme.liquid.');
  }

  const missingDirectories = SHOPIFY_THEME_DIRECTORIES.filter(
    (directory) => !files.some((file) => file.directory === directory)
  );
  if (missingDirectories.length > 0) {
    warnings.push(
      `Missing optional Shopify theme directories: ${missingDirectories.join(
        ', '
      )}.`
    );
  }

  let settingsSchema: unknown | null = null;
  let settingsData: unknown | null = null;
  try {
    settingsSchema = await readJsonIfExists(
      path.join(rootPath, 'config', 'settings_schema.json')
    );
    settingsData = await readJsonIfExists(
      path.join(rootPath, 'config', 'settings_data.json')
    );
  } catch (error) {
    errors.push(`Invalid Shopify theme config JSON: ${error.message}`);
  }

  return {
    rootPath,
    valid: errors.length === 0,
    errors,
    warnings,
    files,
    templates: files
      .filter((file) => file.directory === 'templates')
      .map((file) => file.relativePath),
    sections: files
      .filter((file) => file.directory === 'sections')
      .map((file) => file.relativePath),
    snippets: files
      .filter((file) => file.directory === 'snippets')
      .map((file) => file.relativePath),
    locales: files
      .filter((file) => file.directory === 'locales')
      .map((file) => file.relativePath),
    settingsSchema,
    settingsData
  };
}
