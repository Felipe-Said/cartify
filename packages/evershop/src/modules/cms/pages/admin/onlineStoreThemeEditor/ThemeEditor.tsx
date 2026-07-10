import { PageHeading } from '@components/admin/PageHeading.js';
import {
  ChevronDown,
  Eye,
  Monitor,
  PanelLeft,
  Save,
  Settings,
  Smartphone
} from 'lucide-react';
import React from 'react';
import './ThemeEditor.scss';

type StoreTheme = {
  name: string;
  label: string;
  version: string;
  engine: 'cartify' | 'shopify_liquid';
  status: 'ready' | 'needs_adapter' | 'invalid';
  templateCount: number;
  sectionCount: number;
  localeCount: number;
  errors?: string[];
  warnings?: string[];
  previewUrl: string;
};

interface ThemeEditorProps {
  theme?: StoreTheme | null;
  onlineStoreUrl: string;
}

function Sidebar({ theme }: { theme: StoreTheme }) {
  const sections =
    theme.engine === 'shopify_liquid'
      ? [
          `Templates (${theme.templateCount})`,
          `Sections (${theme.sectionCount})`,
          `Locales (${theme.localeCount})`,
          'Configuracoes do tema'
        ]
      : [
          'Cabecalho',
          'Pagina inicial',
          'Produtos',
          'Rodape',
          'Configuracoes do tema'
        ];

  return (
    <aside className="theme-editor-sidebar">
      <div className="theme-editor-sidebar__header">
        <PanelLeft size={18} />
        <strong>{theme.label}</strong>
      </div>
      <div className="theme-editor-sidebar__group">
        <button type="button" className="theme-editor-sidebar__item active">
          <span>Loja virtual</span>
          <ChevronDown size={16} />
        </button>
        {sections.map((section) => (
          <button type="button" className="theme-editor-sidebar__item" key={section}>
            <span>{section}</span>
          </button>
        ))}
      </div>
      {theme.engine === 'shopify_liquid' && (
        <div className="theme-editor-notice">
          <strong>Shopify Liquid detectado</strong>
          <p>
            A estrutura do tema foi lida. A renderizacao completa exige o
            adaptador Liquid do Cartify.
          </p>
        </div>
      )}
    </aside>
  );
}

function Preview({ theme }: { theme: StoreTheme }) {
  if (theme.engine === 'shopify_liquid') {
    return (
      <div className="theme-editor-preview theme-editor-preview--placeholder">
        <div>
          <h2>{theme.label}</h2>
          <p>
            Tema Shopify preparado para importacao. Templates, sections e
            locales ja sao reconhecidos; falta plugar o renderizador Liquid para
            preview visual fiel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-editor-preview">
      <iframe title="Visualizacao da loja" src={theme.previewUrl || '/'} />
    </div>
  );
}

export default function ThemeEditor({
  theme,
  onlineStoreUrl
}: ThemeEditorProps) {
  if (!theme) {
    return (
      <div className="theme-editor-page">
        <PageHeading heading="Tema nao encontrado" backUrl={onlineStoreUrl} />
      </div>
    );
  }

  return (
    <div className="theme-editor-page">
      <div className="theme-editor-topbar">
        <PageHeading heading="Editor de tema" backUrl={onlineStoreUrl} />
        <div className="theme-editor-actions">
          <button type="button" className="button">
            <Smartphone size={16} />
          </button>
          <button type="button" className="button">
            <Monitor size={16} />
          </button>
          <a
            href={theme.previewUrl || '/'}
            target="_blank"
            rel="noreferrer"
            className="button"
          >
            <Eye size={16} />
            Visualizar
          </a>
          <button type="button" className="button">
            <Settings size={16} />
          </button>
          <button type="button" className="button button--primary">
            <Save size={16} />
            Salvar
          </button>
        </div>
      </div>
      <div className="theme-editor-shell">
        <Sidebar theme={theme} />
        <Preview theme={theme} />
      </div>
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
    theme: storeTheme(name: getContextValue("themeName")) {
      name
      label
      version
      engine
      status
      templateCount
      sectionCount
      localeCount
      errors
      warnings
      previewUrl
    }
  }
`;
