import { listStoreThemes } from '../../../services/theme/listStoreThemes.js';

export default {
  Query: {
    storeThemes: async () => listStoreThemes()
  }
};
