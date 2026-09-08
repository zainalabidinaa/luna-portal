import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { WidgetGrid, TAB_FLAG, type WidgetTab } from '../../components/catalog/WidgetGrid';
import type { Collection, Folder } from '../../types';

// ── Types ───────────────────────────────────────────────────────────────────

interface HomePreset {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  locale_tag: string | null;
  is_active: boolean;
  sort_order: number;
}

interface HomePresetItemDataSource {
  // Widened beyond 'collection' so rows with an unrecognized kind (a manual
  // DB edit, a legacy row, or a future non-collection producer) type-check
  // instead of silently assuming collectionId exists. See the render guard
  // in the items list below.
  kind: string;
  collectionId?: string;
}

interface HomePresetItem {
  id: string;
  preset_id: string;
  // Mirrors WidgetDataSource's encoded shape (Packages/MoonlitCore/Sources/
  // MoonlitCore/Models/WidgetModels.swift). Only the 'collection' kind is
  // producible from this page today.
  data_source: HomePresetItemDataSource;
  media_type: 'movie' | 'series' | null;
  style: string;
  sort_order: number;
}

const STYLES = ['standard', 'heroBanner', 'cardStack', 'carouselCinematic', 'topTen'];
const MEDIA_TYPES: { value: HomePresetItem['media_type']; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' },
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ── Toggle switch (mirrors HomeLayoutPage.tsx's Toggle) ──────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 flex-none rounded-full transition-colors ${on ? 'bg-accent' : 'border border-border bg-surface-2'}`}
      title={on ? 'Active — visible to Premium/Friends & Family' : 'Inactive — hidden from the app'}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePresetsPage() {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<HomePreset[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<HomePresetItem[]>([]);
  const [addCollectionId, setAddCollectionId] = useState('');
  const [loading, setLoading] = useState(true);
  // "Your Widgets" grid (Fix 8) is the primary view of this page — "Manage
  // Presets" (picking which widgets go into a curated Signature/Arabic/…
  // layout, Fix 3's scope) is a distinct, secondary concern that stays
  // reachable via the toggle rather than disappearing.
  const [view, setView] = useState<'widgets' | 'presets'>('widgets');
  const [widgetTab, setWidgetTab] = useState<WidgetTab>('home');

  function openWidget(c: Collection) {
    navigate(`/admin/catalog?collection=${c.id}`);
  }

  async function addWidget() {
    const name = prompt('Widget name')?.trim();
    if (!name) return;
    const { ios, mac } = TAB_FLAG[widgetTab];
    const { data, error } = await supabase.from('collections').insert({
      name, view_mode: 'FOLLOW_LAYOUT', sort_order: collections.length,
      status: 'draft', [ios]: true, [mac]: true,
    }).select().single();
    if (error) { alert(error.message); return; }
    navigate(`/admin/catalog?collection=${(data as Collection).id}`);
  }

  const selected = presets.find((p) => p.id === selectedId) ?? null;
  const collectionName = (id: string) => collections.find((c) => c.id === id)?.name ?? id;

  async function loadPresets() {
    const { data } = await supabase.from('home_presets').select('*').order('sort_order');
    setPresets((data as HomePreset[]) ?? []);
  }

  async function loadItems(presetId: string) {
    const { data } = await supabase
      .from('home_preset_items')
      .select('*')
      .eq('preset_id', presetId)
      .order('sort_order');
    setItems((data as HomePresetItem[]) ?? []);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        loadPresets(),
        supabase
          .from('collections')
          .select('*')
          .order('sort_order')
          .then(({ data }) => setCollections((data as Collection[]) ?? [])),
        supabase
          .from('folders')
          .select('*')
          .order('sort_order')
          .then(({ data }) => setFolders((data as Folder[]) ?? [])),
      ]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (selectedId) loadItems(selectedId);
    else setItems([]);
  }, [selectedId]);

  async function createPreset() {
    const name = prompt('Preset name (e.g. "Arabic")');
    if (!name?.trim()) return;
    const slug = slugify(name);
    const { data, error } = await supabase
      .from('home_presets')
      .insert({ slug, name: name.trim(), is_active: false, sort_order: presets.length })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setPresets((prev) => [...prev, data as HomePreset]);
    setSelectedId((data as HomePreset).id);
  }

  async function updatePreset(patch: Partial<HomePreset>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setPresets((prev) => prev.map((p) => (p.id === selected.id ? next : p)));
    await supabase.from('home_presets').update(patch).eq('id', selected.id);
  }

  async function deletePreset() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}"? This also removes its widget list.`)) return;
    await supabase.from('home_presets').delete().eq('id', selected.id);
    setPresets((prev) => prev.filter((p) => p.id !== selected.id));
    setSelectedId(null);
  }

  async function addItem() {
    if (!selected || !addCollectionId) return;
    const { data, error } = await supabase
      .from('home_preset_items')
      .insert({
        preset_id: selected.id,
        data_source: { kind: 'collection', collectionId: addCollectionId },
        media_type: null,
        style: 'standard',
        sort_order: items.length,
      })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setItems((prev) => [...prev, data as HomePresetItem]);
    setAddCollectionId('');
  }

  async function removeItem(item: HomePresetItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await supabase.from('home_preset_items').delete().eq('id', item.id);
  }

  async function setItemStyle(item: HomePresetItem, style: string) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, style } : i)));
    await supabase.from('home_preset_items').update({ style }).eq('id', item.id);
  }

  async function setItemMediaType(item: HomePresetItem, mediaType: HomePresetItem['media_type']) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, media_type: mediaType } : i)));
    await supabase.from('home_preset_items').update({ media_type: mediaType }).eq('id', item.id);
  }

  async function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    const next = [...items];
    next[index] = { ...b, sort_order: a.sort_order };
    next[target] = { ...a, sort_order: b.sort_order };
    setItems(next);
    await Promise.all([
      supabase.from('home_preset_items').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('home_preset_items').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
  }

  const availableCollections = collections.filter((c) => !items.some((i) => i.data_source.collectionId === c.id));

  if (loading) {
    return (
      <AppShell>
        <p className="text-faint">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Widgets</h1>
          <p className="mt-1 text-sm text-muted">
            {view === 'widgets'
              ? 'Every Home/Movies/Series widget — build and publish them here.'
              : <>Curated home layouts for Premium/Friends & Family accounts. Only <span className="text-accent">active</span> presets show up in the app.</>}
          </p>
        </div>
        {view === 'presets' && <Button onClick={createPreset}>+ New Preset</Button>}
      </div>

      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border-strong overflow-hidden">
          {(['widgets', 'presets'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
                v === view ? 'bg-accent-light text-accent' : 'text-muted hover:text-text'
              }`}
            >
              {v === 'widgets' ? 'Your Widgets' : 'Manage Presets'}
            </button>
          ))}
        </div>
        {view === 'widgets' && (
          <div className="inline-flex rounded-lg border border-border-strong overflow-hidden">
            {(['home', 'movies', 'series'] as WidgetTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setWidgetTab(t)}
                className={`px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
                  t === widgetTab ? 'bg-accent-light text-accent' : 'text-muted hover:text-text'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'widgets' && (
        <WidgetGrid
          collections={collections}
          folders={folders}
          activeTab={widgetTab}
          onSelectCollection={openWidget}
          onAddWidget={addWidget}
        />
      )}

      {view === 'presets' && (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr]">
        {/* Preset list */}
        <div className="space-y-1.5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setSelectedId(preset.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                selectedId === preset.id
                  ? 'border-accent bg-accent-light text-text'
                  : 'border-border bg-surface text-muted hover:bg-surface-2'
              }`}
            >
              <span className="truncate">{preset.name}</span>
              {preset.is_active && <span className="h-2 w-2 flex-none rounded-full bg-accent" title="Active" />}
            </button>
          ))}
          {presets.length === 0 && <p className="text-sm text-faint">No presets yet.</p>}
        </div>

        {/* Editor */}
        {selected ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-faint">Name</span>
                  <input
                    value={selected.name}
                    onChange={(e) => updatePreset({ name: e.target.value })}
                    className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-faint">Slug</span>
                  <input
                    value={selected.slug}
                    onChange={(e) => updatePreset({ slug: e.target.value })}
                    className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-sm text-text focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-faint">Description</span>
                  <input
                    value={selected.description ?? ''}
                    onChange={(e) => updatePreset({ description: e.target.value || null })}
                    className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-faint">Locale tag</span>
                  <input
                    value={selected.locale_tag ?? ''}
                    onChange={(e) => updatePreset({ locale_tag: e.target.value || null })}
                    placeholder="ar, tr, asian…"
                    className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <span className="text-xs font-medium text-faint">Active</span>
                  <Toggle on={selected.is_active} onChange={(v) => updatePreset({ is_active: v })} />
                </div>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button variant="danger" size="sm" onClick={deletePreset}>
                  Delete preset
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold text-text">Widgets in this preset</h2>
              <div className="space-y-2">
                {items.map((item, index) => {
                  if (item.data_source.kind !== 'collection' || !item.data_source.collectionId) {
                    return (
                      <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                        <span className="flex-1 truncate text-sm italic text-faint" title="This item's data source isn't a recognized collection reference">
                          Unsupported item
                        </span>
                        <button onClick={() => removeItem(item)} className="text-faint hover:text-red-400" title="Remove">
                          ×
                        </button>
                      </div>
                    );
                  }
                  return (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <span className="flex-1 truncate text-sm text-text">{collectionName(item.data_source.collectionId)}</span>
                    <select
                      value={item.media_type ?? ''}
                      onChange={(e) => setItemMediaType(item, (e.target.value || null) as HomePresetItem['media_type'])}
                      className="rounded-lg border border-border bg-bg px-2 py-1 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
                    >
                      {MEDIA_TYPES.map((mt) => (
                        <option key={mt.label} value={mt.value ?? ''}>
                          {mt.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={item.style}
                      onChange={(e) => setItemStyle(item, e.target.value)}
                      className="rounded-lg border border-border bg-bg px-2 py-1 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
                    >
                      {STYLES.map((style) => (
                        <option key={style} value={style}>
                          {style}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                      className="text-faint hover:text-accent disabled:opacity-30"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveItem(index, 1)}
                      disabled={index === items.length - 1}
                      className="text-faint hover:text-accent disabled:opacity-30"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button onClick={() => removeItem(item)} className="text-faint hover:text-red-400" title="Remove">
                      ×
                    </button>
                  </div>
                  );
                })}
                {items.length === 0 && <p className="text-sm text-faint">No widgets in this preset yet.</p>}
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
                <select
                  value={addCollectionId}
                  onChange={(e) => setAddCollectionId(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
                >
                  <option value="">Choose a collection…</option>
                  {availableCollections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={addItem} disabled={!addCollectionId}>
                  + Add
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-faint">Select a preset, or create a new one.</p>
        )}
      </div>
      )}
    </AppShell>
  );
}
