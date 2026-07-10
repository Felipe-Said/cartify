import fs from 'fs/promises';
import path from 'path';
import { CONSTANTS } from '../../../../lib/helpers.js';
import { listStoreThemes } from './listStoreThemes.js';

async function readJson(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return {};
  }
}

async function writeThemeToConfig(fileName: string, themeName: string) {
  const filePath = path.join(CONSTANTS.ROOTPATH, 'config', fileName);
  const config = await readJson(filePath);
  config.system = config.system || {};

  if (themeName === 'cartify-default') {
    delete config.system.theme;
  } else {
    config.system.theme = themeName;
  }

  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

export async function publishStoreTheme(themeName: string) {
  const themes = await listStoreThemes();
  const theme = themes.find((item) => item.name === themeName);

  if (!theme) {
    throw new Error('Theme not found.');
  }

  if (theme.engine === 'shopify_liquid') {
    throw new Error(
      'Shopify Liquid themes can be imported and edited, but publishing requires the Cartify Liquid adapter.'
    );
  }

  if (theme.status !== 'ready') {
    throw new Error('Theme is not ready to publish.');
  }

  await writeThemeToConfig('default.json', themeName);
  await writeThemeToConfig('production.json', themeName);

  return {
    name: theme.name,
    status: 'published'
  };
}
