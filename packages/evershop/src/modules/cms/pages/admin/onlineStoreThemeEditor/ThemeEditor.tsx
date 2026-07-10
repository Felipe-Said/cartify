import {
  ChevronDown,
  ChevronRight,
  Eye,
  Home,
  Monitor,
  MoreHorizontal,
  PanelLeft,
  RotateCcw,
  Save,
  Settings,
  Smartphone,
  Undo2
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

const cartifySections = [
  'Announcement bar',
  'Header',
  'Slideshow',
  'Scrolling text',
  'Collection list',
  'Rich text',
  'Image with text',
  'Featured product',
  'Gallery grid',
  'Footer'
];

function Sidebar({ theme }: { theme: StoreTheme }) {
  const modelSections =
    theme.engine === 'shopify_liquid'
      ? [
          `Templates (${theme.templateCount})`,
          `Sections (${theme.sectionCount})`,
          `Locales (${theme.localeCount})`,
          'Config'
        ]
      : cartifySections;

  return (
    <aside className="theme-editor-sidebar">
      <div className="theme-editor-page-title">Pagina inicial</div>
      <div className="theme-editor-sidebar__block">
        <h3>Header</h3>
        {modelSections.slice(0, 2).map((section) => (
          <button type="button" className="theme-editor-sidebar__item" key={section}>
            <ChevronRight size={14} />
            <span>{section}</span>
            <Eye size={14} />
          </button>
        ))}
        <button type="button" className="theme-editor-add-section">
          Adicionar secao
        </button>
      </div>
      <div className="theme-editor-sidebar__block">
        <h3>Modelo</h3>
        {modelSections.slice(2).map((section) => (
          <button type="button" className="theme-editor-sidebar__item" key={section}>
            <ChevronRight size={14} />
            <span>{section}</span>
            <Eye size={14} />
          </button>
        ))}
      </div>
      {theme.engine === 'shopify_liquid' && (
        <div className="theme-editor-notice">
          <strong>Shopify Liquid detectado</strong>
          <p>
            Templates, sections, snippets e locales foram reconhecidos. A
            renderizacao fiel depende do adaptador Liquid do Cartify.
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
            Tema Shopify importado. O editor mostra a estrutura e prepara o
            tema; o preview Liquid completo entra quando o adaptador estiver
            conectado.
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
        <div className="theme-editor-topbar">
          <a href={onlineStoreUrl} className="theme-editor-icon-button">
            <Undo2 size={18} />
          </a>
          <strong>Tema nao encontrado</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-editor-page">
      <div className="theme-editor-topbar">
        <div className="theme-editor-left-actions">
          <a href={onlineStoreUrl} className="theme-editor-icon-button">
            <Undo2 size={18} />
          </a>
          <button type="button" className="theme-editor-icon-button active">
            <PanelLeft size={18} />
          </button>
          <button type="button" className="theme-editor-icon-button">
            <Settings size={18} />
          </button>
        </div>
        <div className="theme-editor-title">
          <span>{theme.label}</span>
          <span className="status-pill status-pill--active">
            {theme.status === 'ready' ? 'Ativo' : 'Rascunho'}
          </span>
          <span className="theme-editor-template">
            <Home size={16} />
            Pagina inicial
            <ChevronDown size={16} />
          </span>
        </div>
        <div className="theme-editor-actions">
          <button type="button" className="theme-editor-icon-button">
            <Monitor size={17} />
          </button>
          <button type="button" className="theme-editor-icon-button">
            <Smartphone size={17} />
          </button>
          <button type="button" className="theme-editor-icon-button" disabled>
            <RotateCcw size={17} />
          </button>
          <button type="button" className="theme-editor-icon-button" disabled>
            <Undo2 size={17} />
          </button>
          <button type="button" className="theme-editor-icon-button">
            <MoreHorizontal size={18} />
          </button>
          <button type="button" className="button button--primary" disabled>
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
