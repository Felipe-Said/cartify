import { NavigationItemGroup } from '@components/admin/NavigationItemGroup';
import { Store } from 'lucide-react';
import PropTypes from 'prop-types';
import React from 'react';

export default function CmsMenuGroup({ onlineStore }) {
  return (
    <NavigationItemGroup
      id="cmsMenuGroup"
      name="Canais de Vendas"
      items={[
        {
          Icon: Store,
          url: onlineStore,
          title: 'Loja virtual'
        }
      ]}
    />
  );
}

CmsMenuGroup.propTypes = {
  onlineStore: PropTypes.string.isRequired
};

export const layout = {
  areaId: 'adminMenu',
  sortOrder: 60
};

export const query = `
  query Query {
    onlineStore: url(routeId:"onlineStore")
  }
`;
