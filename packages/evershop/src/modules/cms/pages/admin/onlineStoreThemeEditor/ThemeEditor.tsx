import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Home,
  Monitor,
  PanelLeft,
  Plus,
  Save,
  Settings,
  Smartphone,
  Undo2,
  Upload,
  X
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './ThemeEditor.scss';

type ThemeSetting = {
  id?: string;
  type?: string;
  label?: string;
  content?: string;
  info?: string;
  default?: any;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: Array<{ value: string; label?: string }>;
};

type ThemeSchema = {
  name?: string;
  settings?: ThemeSetting[];
  blocks?: Array<{ type?: string; name?: string; settings?: ThemeSetting[] }>;
  presets?: Array<{ name?: string }>;
};

type EditorSection = {
  id: string;
  type: string;
  disabled?: boolean;
  settings: Record<string, any>;
  blocks: Array<{ id: string; type: string; disabled?: boolean; settings: Record<string, any> }>;
  blockOrder: string[];
  schema: ThemeSchema;
};

type EditorData = {
  template: string;
  templateData: { sections?: Record<string, any>; order?: string[]; [key: string]: any };
  global: { settings: Record<string, any>; schema: ThemeSchema[] };
  sections: EditorSection[];
  availableSections: Array<{ type: string; name?: string; settings?: ThemeSetting[]; presets?: Array<{ name?: string }> }>;
};

type StoreTheme = {
  name: string;
  label: string;
  engine: 'cartify' | 'shopify_liquid';
  status: 'ready' | 'needs_adapter' | 'invalid';
  templates?: string[];
  previewUrl: string;
  editorApi: string;
  mediaUploadApi: string;
};

interface ThemeEditorProps {
  theme?: StoreTheme | null;
  onlineStoreUrl: string;
}

function humanize(value?: string) {
  if (!value) return 'Configuração';
  const source = value.startsWith('t:') ? value.split('.').pop() || value : value;
  return source
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fileLabel(file: string) {
  const clean = file.replace(/^templates\//, '');
  return clean === 'index.json' || clean === 'index.liquid' ? 'Página inicial' : humanize(clean.replace(/\.(json|liquid)$/i, ''));
}

function sortTemplates(templates: string[]) {
  return [...templates].sort((a, b) => {
    const aIndex = /templates\/index\.(json|liquid)$/.test(a) ? 0 : 1;
    const bIndex = /templates\/index\.(json|liquid)$/.test(b) ? 0 : 1;
    return aIndex - bIndex || a.localeCompare(b);
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function sectionName(section: EditorSection) {
  return humanize(section.schema?.name || section.type);
}

function settingValue(settings: Record<string, any>, field: ThemeSetting) {
  if (!field.id) return undefined;
  return settings[field.id] === undefined ? field.default : settings[field.id];
}

function Sidebar({
  data,
  selected,
  onSelect,
  onToggle,
  onAdd
}: {
  data: EditorData;
  selected: string;
  onSelect: (value: string) => void;
  onToggle: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <aside className="theme-editor-sidebar">
      <button type="button" className={`theme-editor-sidebar__item theme-editor-sidebar__item--page${selected === 'global' ? ' is-selected' : ''}`} onClick={() => onSelect('global')}>
        <Settings size={16} />
        <span>Configurações do tema</span>
      </button>
      <div className="theme-editor-page-title">Página inicial</div>
      <div className="theme-editor-sidebar__block">
        <h3>Seções da página</h3>
        {data.sections.map((section) => (
          <div className="theme-editor-sidebar__section" key={section.id}>
            <button type="button" className={`theme-editor-sidebar__item${selected === `section:${section.id}` ? ' is-selected' : ''}`} onClick={() => onSelect(`section:${section.id}`)}>
              <ChevronRight size={14} />
              <span>{sectionName(section)}</span>
              <span className="theme-editor-sidebar__visibility" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onToggle(section.id); }} onKeyDown={(event) => { if (event.key === 'Enter') onToggle(section.id); }}>
                {section.disabled ? <EyeOff size={14} /> : <Eye size={14} />}
              </span>
            </button>
            {section.blocks.map((block) => (
              <button type="button" className={`theme-editor-sidebar__block-item${selected === `block:${section.id}:${block.id}` ? ' is-selected' : ''}`} key={block.id} onClick={() => onSelect(`block:${section.id}:${block.id}`)}>
                <ChevronRight size={13} />
                {humanize(section.schema.blocks?.find((item) => item.type === block.type)?.name || block.type)}
              </button>
            ))}
          </div>
        ))}
        <button type="button" className="theme-editor-add-section" onClick={onAdd}>
          <Plus size={16} /> Adicionar seção
        </button>
      </div>
    </aside>
  );
}

function MediaField({
  field,
  value,
  mediaUploadApi,
  onChange
}: {
  field: ThemeSetting;
  value: any;
  mediaUploadApi: string;
  onChange: (value: any) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const isVideo = field.type === 'video' || field.type === 'video_url';
  const displayValue = typeof value === 'string' ? value.split('/').pop() : value?.alt || '';

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('media', file);
      const response = await fetch(mediaUploadApi, { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || 'Não foi possível enviar o arquivo.');
      onChange(isVideo ? { url: payload.data.path, alt: file.name, preview_image: { src: payload.data.path } } : payload.data.path);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="theme-editor-media-field">
      <input ref={input} hidden type="file" accept={isVideo ? 'video/*' : 'image/*'} onChange={(event) => upload(event.target.files?.[0])} />
      <button type="button" className="theme-editor-media-picker" onClick={() => input.current?.click()} disabled={uploading}>
        <Upload size={16} />
        <span>{uploading ? 'Enviando...' : displayValue || (isVideo ? 'Selecionar vídeo' : 'Selecionar imagem')}</span>
      </button>
      {value && <button type="button" className="theme-editor-clear-media" onClick={() => onChange('')}>Remover</button>}
    </div>
  );
}

function Field({ field, value, onChange, mediaUploadApi }: { field: ThemeSetting; value: any; onChange: (value: any) => void; mediaUploadApi: string }) {
  if (field.type === 'header') return <h4 className="theme-editor-field-header">{humanize(field.content)}</h4>;
  if (field.type === 'paragraph') return <p className="theme-editor-field-help">{humanize(field.content)}</p>;
  if (!field.id) return null;
  const label = humanize(field.label || field.id);
  const type = field.type || 'text';
  const common = <><span>{label}</span>{field.info && <small>{humanize(field.info)}</small>}</>;

  if (type === 'checkbox') {
    return <label className="theme-editor-toggle">{common}<input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
  }
  if (type === 'image_picker' || type === 'video' || type === 'video_url') {
    return <label className="theme-editor-field">{common}<MediaField field={field} value={value} mediaUploadApi={mediaUploadApi} onChange={onChange} /></label>;
  }
  if (type === 'color' || type === 'color_background') {
    return <label className="theme-editor-field">{common}<span className="theme-editor-color"><input type="color" value={typeof value === 'string' && value.startsWith('#') ? value : '#000000'} onChange={(event) => onChange(event.target.value)} /><input value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} placeholder="#000000" /></span></label>;
  }
  if (type === 'range' || type === 'number') {
    return <label className="theme-editor-field">{common}<span className="theme-editor-range"><input type="range" min={field.min} max={field.max} step={field.step || 1} value={Number(value ?? field.default ?? field.min ?? 0)} onChange={(event) => onChange(Number(event.target.value))} /><output>{value ?? field.default ?? field.min ?? 0}{field.unit || ''}</output></span></label>;
  }
  if (type === 'select' || type === 'radio' || type === 'text_alignment' || type === 'color_scheme') {
    const options = type === 'text_alignment' ? [{ value: 'left', label: 'Esquerda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Direita' }] : field.options || [];
    return <label className="theme-editor-field">{common}<select value={value ?? field.default ?? ''} onChange={(event) => onChange(event.target.value)}><option value="">Selecionar</option>{options.map((option) => <option key={option.value} value={option.value}>{humanize(option.label || option.value)}</option>)}</select></label>;
  }
  if (type === 'textarea' || type === 'richtext' || type === 'inline_richtext' || type === 'liquid') {
    return <label className="theme-editor-field">{common}<textarea value={value ?? field.default ?? ''} onChange={(event) => onChange(event.target.value)} rows={type === 'richtext' ? 5 : 3} /></label>;
  }
  return <label className="theme-editor-field">{common}<input type={type === 'url' ? 'url' : 'text'} value={typeof value === 'string' ? value : value?.url || field.default || ''} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Inspector({
  data,
  selected,
  mediaUploadApi,
  onGlobalChange,
  onSectionChange,
  onBlockChange
}: {
  data: EditorData;
  selected: string;
  mediaUploadApi: string;
  onGlobalChange: (id: string, value: any) => void;
  onSectionChange: (sectionId: string, id: string, value: any) => void;
  onBlockChange: (sectionId: string, blockId: string, id: string, value: any) => void;
}) {
  if (selected === 'global') {
    return <aside className="theme-editor-inspector"><span className="theme-editor-inspector__eyebrow">Tema</span><h3>Configurações do tema</h3><p>Essas opções aparecem em toda a loja.</p>{data.global.schema.map((group, index) => <section className="theme-editor-settings-group" key={`${group.name}-${index}`}><h4>{humanize(group.name)}</h4>{group.settings?.map((field) => <Field key={field.id || field.content} field={field} value={settingValue(data.global.settings, field)} onChange={(value) => field.id && onGlobalChange(field.id, value)} mediaUploadApi={mediaUploadApi} />)}</section>)}</aside>;
  }
  const [kind, sectionId, blockId] = selected.split(':');
  const section = data.sections.find((item) => item.id === sectionId);
  if (!section) return null;
  const block = kind === 'block' ? section.blocks.find((item) => item.id === blockId) : null;
  const fields = block ? section.schema.blocks?.find((item) => item.type === block.type)?.settings || [] : section.schema.settings || [];
  const values = block ? block.settings : section.settings;
  const title = block ? humanize(section.schema.blocks?.find((item) => item.type === block.type)?.name || block.type) : sectionName(section);
  return <aside className="theme-editor-inspector"><span className="theme-editor-inspector__eyebrow">{block ? 'Bloco' : 'Seção'}</span><h3>{title}</h3><p>{block ? 'Edite o conteúdo deste bloco.' : 'Edite o layout e o conteúdo desta seção.'}</p><section className="theme-editor-settings-group">{fields.map((field) => <Field key={field.id || field.content} field={field} value={settingValue(values, field)} mediaUploadApi={mediaUploadApi} onChange={(value) => field.id && (block ? onBlockChange(section.id, block.id, field.id, value) : onSectionChange(section.id, field.id, value))} />)}</section></aside>;
}

function AddSectionModal({ sections, onAdd, onClose }: { sections: EditorData['availableSections']; onAdd: (type: string) => void; onClose: () => void }) {
  return <div className="theme-editor-modal" role="dialog" aria-modal="true"><button type="button" className="theme-editor-modal__backdrop" onClick={onClose} /><section className="theme-editor-modal__panel"><div><h2>Adicionar seção</h2><button type="button" className="theme-editor-icon-button" onClick={onClose}><X size={18} /></button></div><p>Escolha uma seção que o tema disponibiliza para a página.</p><div className="theme-editor-add-list">{sections.map((section) => <button type="button" key={section.type} onClick={() => onAdd(section.type)}><span>{humanize(section.name || section.type)}</span><ChevronRight size={17} /></button>)}</div></section></div>;
}

function Preview({ theme, template, device, refreshKey }: { theme: StoreTheme; template: string; device: 'desktop' | 'mobile'; refreshKey: number }) {
  const separator = theme.previewUrl.includes('?') ? '&' : '?';
  const url = `${theme.previewUrl}${separator}template=${encodeURIComponent(template)}&preview=${refreshKey}`;
  return <div className={`theme-editor-preview theme-editor-preview--${device}`}><div className="theme-editor-device-frame"><iframe title="Visualização da loja" src={url} /></div></div>;
}

export default function ThemeEditor({ theme, onlineStoreUrl }: ThemeEditorProps) {
  const templates = useMemo(() => sortTemplates((theme?.templates || []).filter((item) => item.endsWith('.json'))), [theme?.templates]);
  const [template, setTemplate] = useState(templates[0] || 'templates/index.json');
  const [data, setData] = useState<EditorData | null>(null);
  const [selected, setSelected] = useState('global');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!theme || theme.engine !== 'shopify_liquid') return;
    const controller = new AbortController();
    setData(null);
    setDirty(false);
    setSelected('global');
    fetch(`${theme.editorApi}?template=${encodeURIComponent(template)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || 'Não foi possível carregar o tema.');
        setData(payload.data);
      })
      .catch((error) => { if (error.name !== 'AbortError') window.alert(error.message); });
    return () => controller.abort();
  }, [theme, template]);

  if (!theme) return <div className="theme-editor-page"><div className="theme-editor-topbar"><a href={onlineStoreUrl} className="theme-editor-icon-button"><Undo2 size={18} /></a><strong>Tema não encontrado</strong></div></div>;
  if (theme.engine !== 'shopify_liquid') return <div className="theme-editor-page"><div className="theme-editor-topbar"><a href={onlineStoreUrl} className="theme-editor-icon-button"><Undo2 size={18} /></a><strong>Este editor visual está disponível para temas Shopify importados.</strong></div></div>;

  function update(mutator: (current: EditorData) => void) {
    setData((current) => { if (!current) return current; const next = clone(current); mutator(next); return next; });
    setDirty(true);
  }
  function updateSection(sectionId: string, id: string, value: any) { update((current) => { current.templateData.sections![sectionId].settings ||= {}; current.templateData.sections![sectionId].settings[id] = value; const section = current.sections.find((item) => item.id === sectionId); if (section) section.settings[id] = value; }); }
  function updateBlock(sectionId: string, blockId: string, id: string, value: any) { update((current) => { current.templateData.sections![sectionId].blocks[blockId].settings ||= {}; current.templateData.sections![sectionId].blocks[blockId].settings[id] = value; const block = current.sections.find((item) => item.id === sectionId)?.blocks.find((item) => item.id === blockId); if (block) block.settings[id] = value; }); }
  function toggleSection(sectionId: string) { update((current) => { const item = current.templateData.sections![sectionId]; item.disabled = !item.disabled; const section = current.sections.find((value) => value.id === sectionId); if (section) section.disabled = item.disabled; }); }
  function addSection(type: string) { update((current) => { const id = `${type}_${Math.random().toString(36).slice(2, 8)}`; const source = current.availableSections.find((item) => item.type === type); const settings = Object.fromEntries((source?.settings || []).filter((field) => field.id).map((field) => [field.id!, field.default ?? ''])); current.templateData.sections ||= {}; current.templateData.order ||= []; current.templateData.sections[id] = { type, settings }; current.templateData.order.push(id); current.sections.push({ id, type, settings, blocks: [], blockOrder: [], schema: { name: source?.name || type, settings: source?.settings || [], blocks: [] } }); setSelected(`section:${id}`); }); setAddOpen(false); }
  async function save() { if (!data || saving) return; setSaving(true); try { const response = await fetch(theme.editorApi, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: data.template, templateData: data.templateData, globalSettings: data.global.settings }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload?.error?.message || 'Não foi possível salvar o tema.'); setDirty(false); setRefreshKey((value) => value + 1); } catch (error) { window.alert(error instanceof Error ? error.message : 'Não foi possível salvar o tema.'); } finally { setSaving(false); } }

  return <div className="theme-editor-page"><div className="theme-editor-topbar"><div className="theme-editor-left-actions"><a href={onlineStoreUrl} className="theme-editor-icon-button" title="Voltar"><Undo2 size={18} /></a><button type="button" className={`theme-editor-icon-button${sidebarOpen ? ' active' : ''}`} onClick={() => setSidebarOpen((value) => !value)} title="Seções"><PanelLeft size={18} /></button></div><div className="theme-editor-title"><span>{theme.label}</span><span className="status-pill status-pill--active">{theme.status === 'ready' ? 'Ativo' : 'Rascunho'}</span><span className="theme-editor-template"><Home size={16} /><select value={template} onChange={(event) => setTemplate(event.target.value)}>{templates.map((item) => <option key={item} value={item}>{fileLabel(item)}</option>)}</select></span></div><div className="theme-editor-actions"><button type="button" className={`theme-editor-icon-button${device === 'desktop' ? ' active' : ''}`} onClick={() => setDevice('desktop')} title="Desktop"><Monitor size={17} /></button><button type="button" className={`theme-editor-icon-button${device === 'mobile' ? ' active' : ''}`} onClick={() => setDevice('mobile')} title="Celular"><Smartphone size={17} /></button><button type="button" className="theme-editor-icon-button" disabled={!dirty} onClick={() => window.location.reload()} title="Descartar alterações"><Undo2 size={17} /></button><button type="button" className="button button--primary" disabled={!dirty || saving} onClick={save}><Save size={16} />{saving ? 'Salvando...' : 'Salvar'}</button></div></div><div className={`theme-editor-shell${sidebarOpen ? '' : ' theme-editor-shell--sidebar-closed'}`}>{data ? <>{sidebarOpen && <Sidebar data={data} selected={selected} onSelect={setSelected} onToggle={toggleSection} onAdd={() => setAddOpen(true)} />}<Preview theme={theme} template={template} device={device} refreshKey={refreshKey} /><Inspector data={data} selected={selected} mediaUploadApi={theme.mediaUploadApi} onGlobalChange={(id, value) => update((current) => { current.global.settings[id] = value; })} onSectionChange={updateSection} onBlockChange={updateBlock} /></> : <div className="theme-editor-loading">Carregando as opções do tema…</div>}</div>{addOpen && data && <AddSectionModal sections={data.availableSections} onAdd={addSection} onClose={() => setAddOpen(false)} />}</div>;
}

export const layout = { areaId: 'content', sortOrder: 10 };

export const query = `
  query Query {
    onlineStoreUrl: url(routeId: "onlineStore")
    theme: storeTheme(name: getContextValue("themeName")) {
      name label engine status templates previewUrl editorApi mediaUploadApi
    }
  }
`;
