import { PageHeading } from '@components/admin/PageHeading.js';
import {
  ChevronDown,
  Plus,
  X,
  Eye,
  Globe2,
  MoreHorizontal,
  Upload
} from 'lucide-react';
import React from 'react';
import './OnlineStore.scss';

type StoreTheme = {
  name: string;
  label: string;
  version: string;
  role: 'main' | 'unpublished';
  engine: 'cartify' | 'shopify_liquid';
  status: 'ready' | 'needs_adapter' | 'invalid';
  lastSavedAt?: string | null;
  fileCount: number;
  templateCount: number;
  sectionCount: number;
  localeCount: number;
  errors?: string[];
  warnings?: string[];
  editUrl: string;
  publishApi: string;
  previewUrl: string;
};

interface OnlineStoreProps {
  storeThemes?: StoreTheme[];
  uploadApi: string;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Sem data';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function themeEngine(theme: StoreTheme) {
  return theme.engine === 'shopify_liquid' ? 'Shopify Liquid' : 'Cartify';
}

function statusLabel(theme: StoreTheme) {
  if (theme.status === 'ready') {
    return 'Pronto';
  }
  if (theme.status === 'needs_adapter') {
    return 'Shopify importado';
  }
  return 'Revisar';
}

async function publishTheme(theme: StoreTheme) {
  const response = await fetch(theme.publishApi, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    window.alert(payload?.error?.message || 'Nao foi possivel publicar o tema.');
    return;
  }
  window.location.reload();
}

function ThemePreview({ theme }: { theme: StoreTheme }) {
  return (
    <div className="online-store-preview" aria-hidden="true">
      <div className="online-store-preview__browser">
        <span />
        <span />
        <span />
      </div>
      <div className="online-store-preview__hero">
        <div>
          <span>{theme.label}</span>
          <strong>{themeEngine(theme)}</strong>
        </div>
      </div>
      <div className="online-store-preview__grid">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function ThemeActions({
  primary = false,
  theme
}: {
  primary?: boolean;
  theme: StoreTheme;
}) {
  return (
    <div className="online-store-actions">
      <button type="button" className="button button--icon">
        <MoreHorizontal size={18} />
      </button>
      <a
        href={theme.editUrl}
        className={primary ? 'button button--primary' : 'button'}
      >
        Editar tema
      </a>
    </div>
  );
}

function ActiveTheme({ theme }: { theme: StoreTheme }) {
  return (
    <section className="online-store-card online-store-card--active">
      <ThemePreview theme={theme} />
      <div className="online-store-card__body">
        <div>
          <div className="online-store-title-row">
            <h2>{theme.label}</h2>
            <span className="status-pill status-pill--active">Ativo</span>
            <span className="status-pill">{statusLabel(theme)}</span>
          </div>
          <p>Salvo pela ultima vez: {formatDate(theme.lastSavedAt)}</p>
          <p className="online-store-card__meta">
            Versao {theme.version} - {themeEngine(theme)}
          </p>
        </div>
        <ThemeActions primary theme={theme} />
      </div>
    </section>
  );
}

function DraftTheme({ theme }: { theme: StoreTheme }) {
  const cannotPublish =
    theme.engine === 'shopify_liquid' || theme.status !== 'ready';
  return (
    <article className="online-store-draft">
      <ThemePreview theme={theme} />
      <div className="online-store-draft__content">
        <h3>{theme.label}</h3>
        <p>Adicionado: {formatDate(theme.lastSavedAt)}</p>
        <p>
          Versao {theme.version} - {themeEngine(theme)} - {theme.templateCount}{' '}
          templates
        </p>
      </div>
      <div className="online-store-actions">
        <button type="button" className="button button--icon">
          <MoreHorizontal size={18} />
        </button>
        <button
          type="button"
          className="button"
          onClick={() => publishTheme(theme)}
          disabled={cannotPublish}
          title={
            cannotPublish
              ? 'Temas Shopify Liquid precisam do adaptador Liquid antes de publicar.'
              : undefined
          }
        >
          Publicar
        </button>
        <button type="button" className="button button--icon">
          <ChevronDown size={16} />
        </button>
        <a href={theme.editUrl} className="button">
          Editar tema
        </a>
      </div>
    </article>
  );
}

function UploadThemeModal({
  uploadApi,
  onClose
}: {
  uploadApi: string;
  onClose: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  async function submit() {
    if (!file) {
      return;
    }

    setIsUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('theme', file);

    try {
      const response = await fetch(uploadApi, {
        method: 'POST',
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message || 'Nao foi possivel enviar o tema.');
        return;
      }
      window.location.reload();
    } catch (uploadError) {
      setError('Nao foi possivel enviar o tema.');
    } finally {
      setIsUploading(false);
    }
  }

  function selectFile(selectedFile?: File | null) {
    if (!selectedFile) {
      setFile(null);
      return;
    }
    if (!selectedFile.name.toLowerCase().endsWith('.zip')) {
      setError('Envie um arquivo .zip do tema.');
      setFile(null);
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('O arquivo deve ter no maximo 50 MB.');
      setFile(null);
      return;
    }
    setError(null);
    setFile(selectedFile);
  }

  return (
    <div className="theme-upload-modal" role="dialog" aria-modal="true">
      <div className="theme-upload-modal__backdrop" onClick={onClose} />
      <div className="theme-upload-modal__panel">
        <div className="theme-upload-modal__header">
          <h2>Fazer upload do tema</h2>
          <button type="button" className="button button--icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="theme-upload-modal__body">
          <p>
            Faca upload de um arquivo .zip do seu tema da Shopify. Por padrao,
            os temas dos quais voce fizer upload nao serao publicados.
          </p>
          <p>Tamanho maximo do arquivo: 50 MB</p>
          <button
            type="button"
            className="theme-upload-dropzone"
            onClick={() => inputRef.current?.click()}
          >
            <span>
              <Plus size={18} />
              {file ? file.name : 'Adicionar arquivo'}
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            hidden
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
          {error && <p className="theme-upload-modal__error">{error}</p>}
        </div>
        <div className="theme-upload-modal__footer">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!file || isUploading}
            onClick={submit}
          >
            {isUploading ? 'Enviando...' : 'Fazer upload de arquivo'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OnlineStore({
  storeThemes = [],
  uploadApi
}: OnlineStoreProps) {
  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);
  const activeTheme =
    storeThemes.find((theme) => theme.role === 'main') || storeThemes[0];
  const draftThemes = storeThemes.filter((theme) => theme !== activeTheme);

  return (
    <div className="online-store-page">
      <PageHeading heading="Loja virtual" />

      <div className="online-store-toolbar">
        <button type="button" className="button">
          <Eye size={16} />
          Publica
          <ChevronDown size={16} />
        </button>
        <a href="/" target="_blank" rel="noreferrer" className="button">
          <Globe2 size={16} />
          Ver loja
        </a>
        <button type="button" className="button button--icon">
          <MoreHorizontal size={18} />
        </button>
      </div>

      <section className="online-store-metrics">
        <div>
          <span>7 dias</span>
          <strong>LCP P75</strong>
          <p>0 milissegundo</p>
        </div>
        <div>
          <span>Desempenho</span>
          <strong>CLS</strong>
          <p>0</p>
        </div>
        <div>
          <span>Sessoes</span>
          <strong>Desktop</strong>
          <p>1 visita</p>
        </div>
      </section>

      {activeTheme ? (
        <ActiveTheme theme={activeTheme} />
      ) : (
        <section className="online-store-empty">
          <h2>Nenhum tema instalado</h2>
          <p>Importe um tema Shopify ou crie um tema Cartify para iniciar.</p>
        </section>
      )}

      <section className="online-store-drafts">
        <div className="online-store-section-heading">
          <h2>Rascunhos de tema</h2>
          <button
            type="button"
            className="button"
            onClick={() => setUploadModalOpen(true)}
          >
            <Upload size={16} />
            Importar
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="online-store-draft-list">
          {draftThemes.length > 0 ? (
            draftThemes.map((theme) => (
              <DraftTheme key={theme.name} theme={theme} />
            ))
          ) : (
            <div className="online-store-empty online-store-empty--small">
              <h3>Sem rascunhos</h3>
              <p>Temas Shopify importados aparecem aqui como rascunho.</p>
            </div>
          )}
        </div>
      </section>
      {uploadModalOpen && (
        <UploadThemeModal
          uploadApi={uploadApi}
          onClose={() => setUploadModalOpen(false)}
        />
      )}
    </div>
  );
}

export const layout = {
  areaId: 'content',
  sortOrder: 10
};

export const query = `
  query Query {
    storeThemes {
      name
      label
      version
      role
      engine
      status
      lastSavedAt
      fileCount
      templateCount
      sectionCount
      localeCount
      errors
      warnings
      editUrl
      publishApi
      previewUrl
    }
    uploadApi: url(routeId: "uploadStoreTheme")
  }
`;
