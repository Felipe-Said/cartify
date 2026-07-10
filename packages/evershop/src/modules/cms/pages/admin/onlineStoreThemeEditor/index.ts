import { setPageMetaInfo } from '../../../../cms/services/pageMetaInfo.js';
import { setContextValue } from '../../../../graphql/services/contextHelper.js';

export default (request) => {
  setContextValue(request, 'themeName', request.params.theme);
  setPageMetaInfo(request, {
    title: 'Editor de tema',
    description: 'Editor de tema'
  });
};
