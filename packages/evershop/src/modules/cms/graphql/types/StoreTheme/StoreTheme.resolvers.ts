import { buildUrl } from '../../../../../lib/router/buildUrl.js';
import { listStoreThemes } from '../../../services/theme/listStoreThemes.js';

export default {
  Query: {
    storeTheme: async (_, { name }) => {
      const themes = await listStoreThemes();
      return themes.find((theme) => theme.name === name) || null;
    },
    storeThemes: async () => listStoreThemes()
  },
  StoreTheme: {
    editUrl: ({ name }) =>
      buildUrl('onlineStoreThemeEditor', { theme: name }),
    publishApi: ({ name }) =>
      buildUrl('publishStoreTheme', { theme: name }),
    previewUrl: () => '/'
  }
};
