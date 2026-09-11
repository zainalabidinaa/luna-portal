// src/components/catalog/CollectionSettings.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { cloneCollection } from '../../lib/cloneCollection';
import { Button } from '../ui/Button';
import type { Collection, Folder, FolderCatalog, FolderSource } from '../../types';

const VIEW_MODES = ['FOLLOW_LAYOUT', 'GRID', 'LIST'];

type TabFlagKey =
  | 'show_ios_home' | 'show_ios_movies' | 'show_ios_series'
  | 'show_mac_home' | 'show_mac_movies' | 'show_mac_series';
const TAB_FLAG_KEYS: TabFlagKey[] = [
  'show_ios_home', 'show_ios_movies', 'show_ios_series',
  'show_mac_home', 'show_mac_movies', 'show_mac_series',
];
function tabOf(key: TabFlagKey): 'home' | 'movies' | 'series' {
  if (key.endsWith('home')) return 'home';
  if (key.endsWith('movies')) return 'movies';
  return 'series';
}
function tabsVisibleOn(c: Collection): Set<'home' | 'movies' | 'series'> {
  const tabs = new Set<'home' | 'movies' | 'series'>();
  if (c.show_ios_home || c.show_mac_home) tabs.add('home');
  if (c.show_ios_movies || c.show_mac_movies) tabs.add('movies');
  if (c.show_ios_series || c.show_mac_series) tabs.add('series');
  return tabs;
}

interface Props {
  collection: Collection;
  folders: Folder[];
  allCollections: Collection[];
  onSave: (patch: Partial<Collection>) => Promise<void>;
}

export function CollectionSettings({ collection, folders, allCollections, onSave }: Props) {
  const [draft, setDraft] = useState<Collection>(collection);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => setDraft(collection), [collection]);

  const dirty =
    draft.name !== collection.name ||
    (draft.backdrop_image ?? '') !== (collection.backdrop_image ?? '') ||
    draft.view_mode !== collection.view_mode ||
    draft.show_all_tab !== collection.show_all_tab ||
    draft.focus_glow_enabled !== collection.focus_glow_enabled ||
    draft.pin_to_top !== collection.pin_to_top ||
    draft.enabled !== collection.enabled ||
    draft.show_ios_home !== collection.show_ios_home ||
    draft.show_ios_movies !== collection.show_ios_movies ||
    draft.show_ios_series !== collection.show_ios_series ||
    draft.show_mac_home !== collection.show_mac_home ||
    draft.show_mac_movies !== collection.show_mac_movies ||
    draft.show_mac_series !== collection.show_mac_series ||
    draft.status !== collection.status ||
    draft.display_section !== collection.display_section;

  function set<K extends keyof Collection>(key: K, value: Collection[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Turning on a tab this collection wasn't already visible on, while
      // it's already visible on some OTHER tab, would leave one
      // `collections` row (and its whole folder/source/catalog subtree)
      // shared across tabs — editing it from either tab would edit both.
      // Split any such newly-added tab off into its own independent clone
      // instead (mirrors HomeLayoutPage.tsx's toggleTabFlag).
      const currentTabs = tabsVisibleOn(collection);
      const newTabs = new Set<'home' | 'movies' | 'series'>();
      if (currentTabs.size > 0) {
        for (const key of TAB_FLAG_KEYS) {
          if (draft[key] && !collection[key]) {
            const t = tabOf(key);
            if (!currentTabs.has(t)) newTabs.add(t);
          }
        }
      }

      const adjustedFlags = {} as Record<TabFlagKey, boolean>;
      for (const key of TAB_FLAG_KEYS) {
        adjustedFlags[key] = newTabs.has(tabOf(key)) ? collection[key] : draft[key];
      }

      for (const t of newTabs) {
        const clone = await cloneCollection(collection.id, null);
        if (!clone) continue;
        const clonePatch: Partial<Collection> = {};
        for (const key of TAB_FLAG_KEYS) {
          if (tabOf(key) === t) clonePatch[key] = draft[key];
        }
        if (t === 'home') clonePatch.show_on_home = Boolean(draft.show_ios_home || draft.show_mac_home);
        await supabase.from('collections').update(clonePatch).eq('id', clone.id);
      }

      await onSave({
        name: draft.name.trim() || collection.name,
        backdrop_image: draft.backdrop_image || null,
        view_mode: draft.view_mode,
        show_all_tab: draft.show_all_tab,
        focus_glow_enabled: draft.focus_glow_enabled,
        pin_to_top: draft.pin_to_top,
        enabled: draft.enabled,
        show_on_home: adjustedFlags.show_ios_home || adjustedFlags.show_mac_home,
        show_ios_home: adjustedFlags.show_ios_home,
        show_ios_movies: adjustedFlags.show_ios_movies,
        show_ios_series: adjustedFlags.show_ios_series,
        show_mac_home: adjustedFlags.show_mac_home,
        show_mac_movies: adjustedFlags.show_mac_movies,
        show_mac_series: adjustedFlags.show_mac_series,
        status: draft.status,
        display_section: draft.display_section,
      });

      if (newTabs.size > 0) {
        alert(`"${draft.name}" was already visible on another tab, so ${newTabs.size} newly-checked tab${newTabs.size === 1 ? '' : 's'} got its own independent copy instead of sharing this widget.`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function exportCollection() {
    setExporting(true);
    try {
      const folderIds = folders.map((f) => f.id);
      let cats: FolderCatalog[] = [];
      let srcs: FolderSource[] = [];
      if (folderIds.length) {
        [cats, srcs] = await Promise.all([
          fetchAll<FolderCatalog>('folder_catalogs', folderIds),
          fetchAll<FolderSource>('folder_sources', folderIds),
        ]);
      }
      const payload = buildPayload([collection], folders, cats, srcs);
      triggerDownload(payload, `${slugify(collection.name)}.json`);
    } finally {
      setExporting(false);
    }
  }

  async function exportAll() {
    setExporting(true);
    try {
      const { data: allFolders, error: fErr } = await supabase
        .from('folders')
        .select('*')
        .in('collection_id', allCollections.map((c) => c.id))
        .order('sort_order');
      if (fErr) throw new Error(fErr.message);

      const folderRows = (allFolders ?? []) as Folder[];
      const allFolderIds = folderRows.map((f) => f.id);

      let allCats: FolderCatalog[] = [];
      let allSrcs: FolderSource[] = [];
      if (allFolderIds.length) {
        [allCats, allSrcs] = await Promise.all([
          fetchAll<FolderCatalog>('folder_catalogs', allFolderIds),
          fetchAll<FolderSource>('folder_sources', allFolderIds),
        ]);
      }

      const payload = buildPayload(allCollections, folderRows, allCats, allSrcs);
      triggerDownload(payload, `moonlit-all-collections.json`);
    } finally {
      setExporting(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-mono text-[10.5px] text-muted outline-none focus:border-accent';
  const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-widest text-faint';

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
              Collection · {collection.name}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${
                collection.status === 'published'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400'
              }`}
            >
              {collection.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Edit backdrop, display settings, then save. Export to re-import elsewhere.
          </p>
        </div>
        <Button size="sm" loading={saving} disabled={!dirty} onClick={handleSave}>
          {dirty ? 'Save settings' : 'Saved'}
        </Button>
      </div>

      {/* Settings grid */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        {/* Backdrop image slot */}
        <div className="overflow-hidden rounded-2xl border border-border bg-bg2">
          <div className="relative flex h-[130px] items-center justify-center overflow-hidden bg-surface-2">
            {draft.backdrop_image ? (
              <img src={draft.backdrop_image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 font-mono text-[11px] text-faint">
                <svg className="h-6 w-6 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                not set
              </div>
            )}
          </div>
          <div className="p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-text">Backdrop</span>
              <span className="flex-none rounded border border-accent/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-accent">
                backdrop_image
              </span>
            </div>
            <input
              value={draft.backdrop_image ?? ''}
              onChange={(e) => set('backdrop_image', e.target.value || null)}
              placeholder="https://…"
              className={inputClass}
            />
            <p className="mt-1.5 text-[11px] text-faint">
              Hero image shown on the collection card
            </p>
          </div>
        </div>

        {/* Name */}
        <div className="overflow-hidden rounded-2xl border border-border bg-bg2 p-3.5">
          <label className={labelClass}>Name</label>
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputClass}
          />
          <p className="mt-1.5 text-[11px] text-faint">Display name of the collection</p>

          {/* View mode */}
          <label className={`mt-4 block ${labelClass}`}>View mode</label>
          <div className="flex gap-1.5">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode}
                onClick={() => set('view_mode', mode)}
                className={`flex-1 rounded-md border px-1 py-1.5 font-mono text-[9px] uppercase tracking-wide transition-colors ${
                  draft.view_mode === mode
                    ? 'border-accent bg-accent-light text-accent'
                    : 'border-border text-muted hover:border-accent/40'
                }`}
              >
                {mode.split('_').pop()}
              </button>
            ))}
          </div>
        </div>

        {/* Publish state + display section */}
        <div className="overflow-hidden rounded-2xl border border-border bg-bg2 p-3.5">
          <label className={labelClass}>Publish state</label>
          <div className="flex gap-1.5">
            {(['draft', 'published'] as const).map((status) => (
              <button
                key={status}
                onClick={() => set('status', status)}
                className={`flex-1 rounded-md border px-1 py-1.5 font-mono text-[9px] uppercase tracking-wide transition-colors ${
                  draft.status === status
                    ? 'border-accent bg-accent-light text-accent'
                    : 'border-border text-muted hover:border-accent/40'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">
            Draft work is invisible everywhere until published — safe to build here.
          </p>

          {/* Display section */}
          <label className={`mt-4 block ${labelClass}`}>Display section</label>
          <div className="flex gap-1.5">
            {([
              { value: null, label: 'default' },
              { value: 'rows' as const, label: 'rows' },
              { value: 'hub' as const, label: 'hub' },
            ]).map(({ value, label }) => (
              <button
                key={label}
                onClick={() => set('display_section', value)}
                className={`flex-1 rounded-md border px-1 py-1.5 font-mono text-[9px] uppercase tracking-wide transition-colors ${
                  draft.display_section === value
                    ? 'border-accent bg-accent-light text-accent'
                    : 'border-border text-muted hover:border-accent/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">
            "default" keeps today's automatic hub-vs-rows behavior; the other two are explicit.
          </p>
        </div>

        {/* Display flags */}
        <div className="overflow-hidden rounded-2xl border border-border bg-bg2">
          <div className="flex h-[130px] flex-wrap content-center items-center justify-center gap-5 bg-surface-2 p-4">
            <Toggle label="Show all tab" on={draft.show_all_tab} onClick={() => set('show_all_tab', !draft.show_all_tab)} />
            <Toggle label="Focus glow" on={draft.focus_glow_enabled} onClick={() => set('focus_glow_enabled', !draft.focus_glow_enabled)} />
            <Toggle label="Pin to top" on={draft.pin_to_top} onClick={() => set('pin_to_top', !draft.pin_to_top)} />
            <Toggle label="Enabled" on={draft.enabled} onClick={() => set('enabled', !draft.enabled)} />
          </div>
          <div className="p-3.5">
            <span className="text-[13px] font-semibold text-text">Display flags</span>
            <p className="mt-1 text-[11px] text-faint">Controls how this collection is rendered in the app</p>
          </div>
        </div>

        {/* Tab visibility matrix */}
        <div className="overflow-hidden rounded-2xl border border-border bg-bg2">
          <div className="flex h-[130px] items-center justify-center bg-surface-2 p-4">
            <table className="border-separate [border-spacing:14px_8px]">
              <thead>
                <tr>
                  <th />
                  {['Home', 'Movies', 'Series'].map((t) => (
                    <th key={t} className="font-mono text-[9px] font-normal uppercase tracking-widest text-faint">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['iOS', 'show_ios_home', 'show_ios_movies', 'show_ios_series'],
                  ['Mac', 'show_mac_home', 'show_mac_movies', 'show_mac_series'],
                ] as const).map(([label, ...keys]) => (
                  <tr key={label}>
                    <td className="font-mono text-[9px] uppercase tracking-widest text-faint">{label}</td>
                    {keys.map((key) => (
                      <td key={key} className="text-center">
                        <button
                          onClick={() => set(key, !draft[key])}
                          className={`h-5 w-5 rounded-md border transition-colors ${
                            draft[key]
                              ? 'border-transparent bg-accent text-[#2a1206]'
                              : 'border-border bg-surface-2 text-transparent hover:border-accent/40'
                          }`}
                        >
                          ✓
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3.5">
            <span className="text-[13px] font-semibold text-text">Tab visibility</span>
            <p className="mt-1 text-[11px] text-faint">Pick which tabs show this collection, per platform</p>
          </div>
        </div>
      </div>

      {/* Export section */}
      <div className="mt-8">
        <h3 className="mb-1 font-mono text-[11px] uppercase tracking-widest text-muted">Export JSON</h3>
        <p className="mb-4 text-[12px] text-faint">
          Downloads a BEST-format JSON that can be re-imported via the JSON tab.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" size="sm" loading={exporting} onClick={exportCollection}>
            ⬇ Export this collection
          </Button>
          <Button variant="ghost" size="sm" loading={exporting} onClick={exportAll}>
            ⬇ Export all collections
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;
const ID_CHUNK = 100;

async function fetchAll<T>(table: string, folderIds: string[]): Promise<T[]> {
  let allRows: T[] = [];
  for (let i = 0; i < folderIds.length; i += ID_CHUNK) {
    const chunk = folderIds.slice(i, i + ID_CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .in('folder_id', chunk)
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as T[];
      allRows = allRows.concat(rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return allRows;
}


function buildPayload(
  collections: Collection[],
  folders: Folder[],
  catalogs: FolderCatalog[],
  sources: FolderSource[] = [],
) {
  const catsByFolder: Record<string, FolderCatalog[]> = {};
  for (const c of catalogs) {
    if (!catsByFolder[c.folder_id]) catsByFolder[c.folder_id] = [];
    catsByFolder[c.folder_id].push(c);
  }
  const srcsByFolder: Record<string, FolderSource[]> = {};
  for (const s of sources) {
    if (!srcsByFolder[s.folder_id]) srcsByFolder[s.folder_id] = [];
    srcsByFolder[s.folder_id].push(s);
  }

  return collections
    .filter((c) => c.enabled ?? true)
    .map((col) => {
      const colFolders = folders
        .filter((f) => f.collection_id === col.id && (f.enabled ?? true))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((f) => {
          const folderCatalogs = catsByFolder[f.id] ?? [];
          const folderSources = srcsByFolder[f.id] ?? [];

          const nuvioSources = [
            ...folderCatalogs.map((c) => ({
              type: c.media_type,
              genre: c.genre ?? 'None',
              addonId: 'aio-metadata',
              provider: 'addon',
              catalogId: c.catalog_id,
            })),
            ...folderSources.map((s) => ({
              type: s.media_type ?? 'movie',
              genre: 'None',
              title: s.title ?? '',
              provider: s.provider,
              tmdbId: s.tmdb_id,
              tmdbSourceType: 'DISCOVER',
            })),
          ];

          return {
            id: f.id,
            title: f.name,
            sources: nuvioSources,
            hideTitle: f.hide_title ?? false,
            tileShape: (f.tile_shape ?? 'poster').toUpperCase(),
            focusGifUrl: f.focus_gif ?? null,
            heroVideoUrl: f.hero_video_url ?? null,
            titleLogoUrl: f.title_logo ?? null,
            coverImageUrl: f.cover_image ?? null,
            focusGifEnabled: f.focus_gif_enabled ?? false,
            heroBackdropUrl: f.hero_backdrop ?? null,
            enabled: f.enabled ?? true,
          };
        });

      return {
        id: col.id,
        title: col.name,
        folders: colFolders,
        pinToTop: col.pin_to_top ?? false,
        viewMode: col.view_mode ?? 'FOLLOW_LAYOUT',
        showAllTab: col.show_all_tab ?? false,
        focusGlowEnabled: col.focus_glow_enabled ?? false,
        backdropImageUrl: col.backdrop_image ?? null,
      };
    });
}

function triggerDownload(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center gap-1.5 text-xs text-muted" onClick={onClick}>
      <span
        className={`relative h-6 w-11 flex-none rounded-full border transition-colors ${
          on ? 'border-transparent bg-accent' : 'border-border bg-surface-2'
        }`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all ${
            on ? 'left-[22px] bg-[#2a1206]' : 'left-0.5 bg-white'
          }`}
        />
      </span>
      {label}
    </label>
  );
}
