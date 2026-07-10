import { PageHeading } from '@components/admin/PageHeading.js';
import { Upload } from 'lucide-react';
import React from 'react';

interface ThemeImportProps {
  onlineStoreUrl: string;
}

export default function ThemeImport({ onlineStoreUrl }: ThemeImportProps) {
  return (
    <div className="online-store-page">
      <PageHeading heading="Importar tema" backUrl={onlineStoreUrl} />
      <section className="online-store-empty">
        <Upload size={28} />
        <h2>Importar tema Shopify</h2>
        <p>
          Envie um tema Shopify descompactado para a pasta themes do projeto.
          O Cartify reconhece layout/theme.liquid, sections, templates,
          snippets, locales e config.
        </p>
        <p>
          Depois do upload/deploy, o tema aparece em Rascunhos de tema na Loja
          virtual.
        </p>
      </section>
    </div>
  );
}

export const layout = {
  areaId: 'content',
  sortOrder: 10
};

export const query = `
  query Query {
    onlineStoreUrl: url(routeId: "onlineStore")
  }
`;
