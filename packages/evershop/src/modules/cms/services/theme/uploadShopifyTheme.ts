import fs from 'fs/promises';
import path from 'path';
import extract from 'extract-zip';
import { CONSTANTS } from '../../../../lib/helpers.js';
import { readShopifyTheme } from '../../../../lib/shopify-theme/readShopifyTheme.js';

const MAX_THEME_ZIP_SIZE = 50 * 1024 * 1024;

function slugifyThemeName(name: string) {
  return name
    .replace(/\.zip$/i, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getUniqueThemePath(baseName: string) {
  let candidate = baseName || 'shopify-theme';
  let counter = 1;
  let themePath = path.join(CONSTANTS.THEMEPATH, candidate);

  while (await exists(themePath)) {
    counter += 1;
    candidate = `${baseName}-${counter}`;
    themePath = path.join(CONSTANTS.THEMEPATH, candidate);
  }

  return { themeName: candidate, themePath };
}

async function normalizeExtractedRoot(themePath: string) {
  const entries = await fs.readdir(themePath, { withFileTypes: true });
  const hasThemeLayout = await exists(path.join(themePath, 'layout', 'theme.liquid'));
  if (hasThemeLayout || entries.length !== 1 || !entries[0].isDirectory()) {
    return;
  }

  const nestedPath = path.join(themePath, entries[0].name);
  if (!(await exists(path.join(nestedPath, 'layout', 'theme.liquid')))) {
    return;
  }

  const nestedEntries = await fs.readdir(nestedPath);
  await Promise.all(
    nestedEntries.map((entry) =>
      fs.rename(path.join(nestedPath, entry), path.join(themePath, entry))
    )
  );
  await fs.rm(nestedPath, { recursive: true, force: true });
}

export async function uploadShopifyTheme(file: Express.Multer.File) {
  if (!file) {
    throw new Error('Nenhum arquivo foi enviado.');
  }

  if (!file.originalname.toLowerCase().endsWith('.zip')) {
    throw new Error('Envie um arquivo .zip do tema.');
  }

  if (file.size > MAX_THEME_ZIP_SIZE) {
    throw new Error('O arquivo deve ter no maximo 50 MB.');
  }

  await fs.mkdir(CONSTANTS.THEMEPATH, { recursive: true });
  const uploadDir = path.join(CONSTANTS.THEMEPATH, '.uploads');
  await fs.mkdir(uploadDir, { recursive: true });

  const baseName = slugifyThemeName(file.originalname);
  const { themeName, themePath } = await getUniqueThemePath(baseName);
  const zipPath = path.join(uploadDir, `${themeName}.zip`);

  await fs.writeFile(zipPath, file.buffer);
  await fs.mkdir(themePath, { recursive: true });

  try {
    await extract(zipPath, { dir: themePath });
    await normalizeExtractedRoot(themePath);
    const manifest = await readShopifyTheme(themePath);
    if (!manifest.valid) {
      await fs.rm(themePath, { recursive: true, force: true });
      throw new Error(manifest.errors.join(' '));
    }
    return {
      name: themeName,
      fileCount: manifest.files.length,
      templateCount: manifest.templates.length,
      sectionCount: manifest.sections.length
    };
  } catch (error) {
    await fs.rm(themePath, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(zipPath, { force: true });
  }
}
