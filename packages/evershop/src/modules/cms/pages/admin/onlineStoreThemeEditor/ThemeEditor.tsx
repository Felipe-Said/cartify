import {
  ChevronRight,
  Eye,
  EyeOff,
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
import React, { useMemo, useState } from 'react';
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
  templates?: string[];
  sections?: string[];
  snippets?: string[];
  locales?: string[];
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

function fileLabel(file: string) {
  const clean = file.replace(/^(templates|sections|snippets|locales)\//, '');
  return clean === 'index.json' || clean === 'index.liquid'
    ? 'Pagina inicial'
    : clean;
}

function sortTemplates(templates: string[]) {
  return [...templates].sort((a, b) => {
    const aIndex = /templates\/index\.(json|liquid)$/.test(a) ? 0 : 1;
    const bIndex = /templates\/index\.(json|liquid)$/.test(b) ? 0 : 1;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    return a.localeCompare(b);
  });
}

function Sidebar({
  theme,
  selectedItem,
  hiddenItems,
  onSelectItem,
  onToggleItem
}: {
  theme: StoreTheme;
  selectedItem: string;
  hiddenItems: string[];
  onSelectItem: (item: string) => void;
  onToggleItem: (item: string) => void;
}) {
  const groups =
    theme.engine === 'shopify_liquid'
      ? [
          {
            title: 'Header',
            items: (theme.templates || []).slice(0, 6)
          },
          {
            title: 'Modelo',
            items: [
              ...(theme.sections || []).slice(0, 18),
              ...(theme.snippets || []).slice(0, 6),
              ...(theme.locales || []).slice(0, 4),
              'config/settings_schema.json'
            ]
          }
        ]
      : [
          {
            title: 'Header',
            items: cartifySections.slice(0, 2)
          },
          {
            title: 'Modelo',
            items: cartifySections.slice(2)
          }
        ];

  return (
    <aside className="theme-editor-sidebar">
      <div className="theme-editor-page-title">Pagina inicial</div>
      {groups.map((group, index) => (
        <div className="theme-editor-sidebar__block" key={group.title}>
          <h3>{group.title}</h3>
          {group.items.map((item) => {
            const isHidden = hiddenItems.includes(item);
            const isSelected = selectedItem === item;
            return (
              <button
                type="button"
                className={`theme-editor-sidebar__item${
                  isSelected ? ' is-selected' : ''
                }`}
                key={item}
                onClick={() => onSelectItem(item)}
              >
                <ChevronRight size={14} />
                <span>{fileLabel(item)}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="theme-editor-sidebar__visibility"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleItem(item);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onToggleItem(item);
                    }
                  }}
                >
                  {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </span>
              </button>
            );
          })}
          {index === 0 && (
            <button
              type="button"
              className="theme-editor-add-section"
              onClick={() => onSelectItem('Adicionar secao')}
            >
              Adicionar secao
            </button>
          )}
        </div>
      ))}
      {theme.engine === 'shopify_liquid' && (
        <div className="theme-editor-notice">
          <strong>Shopify Liquid detectado</strong>
          <p>
            O Cartify esta renderizando a home com Liquid, assets e secoes
            reconhecidas. Recursos exclusivos da Shopify podem exigir ajustes
            no tema.
          </p>
        </div>
      )}
    </aside>
  );
}

function Preview({
  theme,
  device,
  selectedItem,
  selectedTemplate
}: {
  theme: StoreTheme;
  device: 'desktop' | 'mobile';
  selectedItem: string;
  selectedTemplate: string;
}) {
  const separator = theme.previewUrl.includes('?') ? '&' : '?';
  const previewUrl =
    selectedTemplate && selectedTemplate.includes('/')
      ? `${theme.previewUrl}${separator}template=${encodeURIComponent(
          selectedTemplate
        )}`
      : theme.previewUrl;

  return (
    <div className={`theme-editor-preview theme-editor-preview--${device}`}>
      <div className="theme-editor-device-frame">
        <iframe
          title={`Visualizacao da loja - ${selectedItem}`}
          src={previewUrl || '/'}
        />
      </div>
    </div>
  );
}

function Inspector({
  selectedItem,
  theme,
  hasChanges,
  onMarkChanged
}: {
  selectedItem: string;
  theme: StoreTheme;
  hasChanges: boolean;
  onMarkChanged: () => void;
}) {
  const isShopifyFile = selectedItem.includes('/');
  return (
    <aside className="theme-editor-inspector">
      <div>
        <span className="theme-editor-inspector__eyebrow">Selecionado</span>
        <h3>{fileLabel(selectedItem)}</h3>
        <p>
          {isShopifyFile
            ? 'Arquivo importado do tema Shopify. Esta versao permite revisar a estrutura e preparar ajustes visuais.'
            : 'Secao do tema pronta para configuracao visual.'}
        </p>
      </div>
      <label className="theme-editor-field">
        <span>Nome exibido</span>
        <input
          value={fileLabel(selectedItem)}
          onChange={onMarkChanged}
          readOnly={theme.engine === 'shopify_liquid'}
        />
      </label>
      <label className="theme-editor-field">
        <span>Visibilidade</span>
        <select defaultValue="visible" onChange={onMarkChanged}>
          <option value="visible">Visivel</option>
          <option value="hidden">Oculto</option>
        </select>
      </label>
      <div className="theme-editor-inspector__status">
        {hasChanges
          ? 'Alteracoes locais pendentes.'
          : 'Nenhuma alteracao pendente.'}
      </div>
    </aside>
  );
}

export default function ThemeEditor({
  theme,
  onlineStoreUrl
}: ThemeEditorProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const defaultTemplate = useMemo(() => {
    const templates = sortTemplates(theme?.templates || []);
    return templates[0] || 'Pagina inicial';
  }, [theme?.templates]);
  const [selectedTemplate, setSelectedTemplate] = useState(defaultTemplate);
  const [selectedItem, setSelectedItem] = useState(defaultTemplate);
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveLabel, setSaveLabel] = useState('Salvar');

  const templateOptions = useMemo(() => {
    if (!theme?.templates?.length) {
      return ['Pagina inicial'];
    }
    return sortTemplates(theme.templates);
  }, [theme?.templates]);

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

  const toggleHiddenItem = (item: string) => {
    setHiddenItems((items) =>
      items.includes(item)
        ? items.filter((current) => current !== item)
        : [...items, item]
    );
    setHasChanges(true);
  };

  const saveChanges = () => {
    setSaveLabel('Salvando...');
    window.setTimeout(() => {
      setHasChanges(false);
      setSaveLabel('Salvo');
      window.setTimeout(() => setSaveLabel('Salvar'), 1300);
    }, 500);
  };

  return (
    <div className="theme-editor-page">
      <div className="theme-editor-topbar">
        <div className="theme-editor-left-actions">
          <a href={onlineStoreUrl} className="theme-editor-icon-button">
            <Undo2 size={18} />
          </a>
          <button
            type="button"
            className={`theme-editor-icon-button${sidebarOpen ? ' active' : ''}`}
            onClick={() => setSidebarOpen((value) => !value)}
          >
            <PanelLeft size={18} />
          </button>
          <button
            type="button"
            className={`theme-editor-icon-button${inspectorOpen ? ' active' : ''}`}
            onClick={() => setInspectorOpen((value) => !value)}
          >
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
            <select
              value={selectedTemplate}
              onChange={(event) => {
                setSelectedTemplate(event.target.value);
                setSelectedItem(event.target.value);
              }}
            >
              {templateOptions.map((template) => (
                <option key={template} value={template}>
                  {fileLabel(template)}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="theme-editor-actions">
          <button
            type="button"
            className={`theme-editor-icon-button${device === 'desktop' ? ' active' : ''}`}
            onClick={() => setDevice('desktop')}
          >
            <Monitor size={17} />
          </button>
          <button
            type="button"
            className={`theme-editor-icon-button${device === 'mobile' ? ' active' : ''}`}
            onClick={() => setDevice('mobile')}
          >
            <Smartphone size={17} />
          </button>
          <button
            type="button"
            className="theme-editor-icon-button"
            disabled={!hasChanges}
            onClick={() => setHasChanges(false)}
          >
            <RotateCcw size={17} />
          </button>
          <button
            type="button"
            className="theme-editor-icon-button"
            disabled={!hasChanges}
            onClick={() => setHasChanges(false)}
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            className="theme-editor-icon-button"
            onClick={() => setInspectorOpen((value) => !value)}
          >
            <MoreHorizontal size={18} />
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!hasChanges}
            onClick={saveChanges}
          >
            <Save size={16} />
            {saveLabel}
          </button>
        </div>
      </div>
      <div
        className={`theme-editor-shell${
          sidebarOpen ? '' : ' theme-editor-shell--sidebar-closed'
        }${inspectorOpen ? ' theme-editor-shell--inspector-open' : ''}`}
      >
        {sidebarOpen && (
          <Sidebar
            theme={theme}
            selectedItem={selectedItem}
            hiddenItems={hiddenItems}
            onSelectItem={(item) => {
              setSelectedItem(item);
              setInspectorOpen(true);
            }}
            onToggleItem={toggleHiddenItem}
          />
        )}
        <Preview
          theme={theme}
          device={device}
          selectedItem={selectedItem}
          selectedTemplate={selectedTemplate}
        />
        {inspectorOpen && (
          <Inspector
            selectedItem={selectedItem}
            theme={theme}
            hasChanges={hasChanges}
            onMarkChanged={() => setHasChanges(true)}
          />
        )}
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
      templates
      sections
      snippets
      locales
      errors
      warnings
      previewUrl
    }
  }
`;
