import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { useAutoScrollOnDrag } from '../../hooks/useAutoScrollOnDrag';
import { cloneCollection } from '../../lib/cloneCollection';
import type { Collection, Folder, FolderCatalog } from '../../types';

const FUNCTION_URL = 'https://hvfsntdyowapjxobtyli.supabase.co/functions/v1/home-organizer';

// ── Types ───────────────────────────────────────────────────────────────────

interface CollectionWithFolders extends Collection {
  folders: FolderWithCatalogs[];
}

interface FolderWithCatalogs extends Folder {
  catalogs: FolderCatalog[];
}

type DropZone = 'before' | 'after' | 'inside';

// ── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 flex-none rounded-full transition-colors ${on ? 'bg-accent' : 'border border-border bg-surface-2'}`}
      title={on ? 'Enabled — visible in app' : 'Disabled — hidden in app'}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

// ── Catalog chip ─────────────────────────────────────────────────────────────

function CatalogChip({ cat, onDelete }: { cat: FolderCatalog; onDelete: () => void }) {
  return (
    <span className="group flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-text">
      <span className="text-accent">{cat.media_type}</span>
      <span className="text-faint">·</span>
      <span className="max-w-[200px] truncate">{cat.catalog_id}</span>
      {cat.genre && <span className="text-faint">· {cat.genre}</span>}
      <button
        onClick={onDelete}
        className="ml-1 text-faint opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
      >
        ×
      </button>
    </span>
  );
}

// ── Add catalog form ──────────────────────────────────────────────────────────

function AddCatalogForm({ onAdd }: { onAdd: (catalogId: string, mediaType: string, genre: string | null) => Promise<void> }) {
  const [catalogId, setCatalogId] = useState('');
  const [mediaType, setMediaType] = useState('movie');
  const [genre, setGenre] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!catalogId.trim()) return;
    setSaving(true);
    await onAdd(catalogId.trim(), mediaType, genre.trim() || null);
    setCatalogId('');
    setGenre('');
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <input
        value={catalogId}
        onChange={(e) => setCatalogId(e.target.value)}
        placeholder="catalog_id  e.g. tmdb.trending_series"
        className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-[12px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <select
        value={mediaType}
        onChange={(e) => setMediaType(e.target.value)}
        className="rounded-lg border border-border bg-bg px-2.5 py-1.5 font-mono text-[12px] text-text focus:border-accent focus:outline-none"
      >
        <option value="movie">movie</option>
        <option value="series">series</option>
        <option value="all">all</option>
      </select>
      <input
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
        placeholder="genre (optional)"
        className="w-36 rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-[12px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <Button size="sm" type="submit" loading={saving} disabled={!catalogId.trim()}>
        + Add
      </Button>
    </form>
  );
}

// ── Folder row ────────────────────────────────────────────────────────────────

function FolderRow({
  folder,
  onAddCatalog,
  onDeleteCatalog,
  onToggleEnabled,
  draggable,
  dropHighlight,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onUnnest,
  isCollectionDropTarget,
  onDropCollection,
}: {
  folder: FolderWithCatalogs;
  onAddCatalog: (folderId: string, catalogId: string, mediaType: string, genre: string | null) => Promise<void>;
  onDeleteCatalog: (catalogId: string, folderId: string) => Promise<void>;
  onToggleEnabled: (folderId: string, enabled: boolean) => void;
  draggable?: boolean;
  dropHighlight?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  onUnnest?: () => void;
  /** A collection is being dragged from the list above — show this folder as
   *  a "drop to nest here" target instead of its normal folder-reorder drag. */
  isCollectionDropTarget?: boolean;
  onDropCollection?: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative rounded-xl border px-4 py-3 transition-colors ${
        dropHighlight ? 'border-accent bg-accent-light/40' : 'border-border bg-bg'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {isCollectionDropTarget && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropCollection?.(); }}
          className="absolute inset-0 z-[5] flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-light/30"
        >
          <span className="rounded-lg bg-bg/90 px-2 py-1 font-mono text-[10px] text-accent">Drop to nest collection here</span>
        </div>
      )}
      <div className="mb-2.5 flex items-center gap-2">
        {folder.cover_image && (
          <img src={folder.cover_image} alt="" className="h-7 w-7 flex-none rounded-md object-cover" />
        )}
        <span className="text-[13px] font-semibold">{folder.name}</span>
        <Toggle on={folder.enabled} onChange={(v) => onToggleEnabled(folder.id, v)} />
        {onUnnest && (
          <button
            onClick={onUnnest}
            title="Remove from parent — back to top level"
            className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[9px] text-faint hover:border-border-strong hover:text-text"
          >
            ✕ un-nest
          </button>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">{folder.tile_shape?.toLowerCase()} · {folder.catalogs.length} sources</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {folder.catalogs.map((cat) => (
          <CatalogChip
            key={cat.id}
            cat={cat}
            onDelete={() => onDeleteCatalog(cat.id, folder.id)}
          />
        ))}
      </div>

      <AddCatalogForm
        onAdd={(cid, mt, g) => onAddCatalog(folder.id, cid, mt, g)}
      />
    </div>
  );
}

// A folder with `parent_folder_id` set (e.g. "Horror Franchises" under
// "Horror") renders nested beneath its parent instead of as its own row in
// the list — generic, driven entirely by that column. Drag any top-level
// folder onto another to nest it; nested folders get an explicit "un-nest"
// button instead of a drop zone, since there's no reorder behavior to
// preserve here (unlike the collections list).
function FolderList({
  folders,
  onAddCatalog,
  onDeleteCatalog,
  onToggleEnabled,
  onNest,
  onUnnest,
  isCollectionDragActive,
  onDropCollectionOntoFolder,
}: {
  folders: FolderWithCatalogs[];
  onAddCatalog: (folderId: string, catalogId: string, mediaType: string, genre: string | null) => Promise<void>;
  onDeleteCatalog: (catalogId: string, folderId: string) => Promise<void>;
  onToggleEnabled: (folderId: string, enabled: boolean) => void;
  onNest: (folderId: string, parentFolderId: string) => void;
  onUnnest: (folderId: string) => void;
  /** A collection is being dragged from the list above (not a folder
   *  reorder) — every folder becomes a "drop to nest" target instead. */
  isCollectionDragActive?: boolean;
  onDropCollectionOntoFolder?: (folderId: string) => void;
}) {
  const dragFolderId = useRef<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  if (folders.length === 0) {
    return (
      <p className="font-mono text-[11px] text-faint">
        No folders. Add them from the Collection manager.
      </p>
    );
  }
  const topLevel = folders.filter((f) => !f.parent_folder_id);
  return (
    <div className="flex flex-col gap-3">
      {topLevel.map((f) => {
        const children = folders.filter((c) => c.parent_folder_id === f.id);
        return (
          <div key={f.id} className="flex flex-col gap-3">
            <FolderRow
              folder={f}
              onAddCatalog={onAddCatalog}
              onDeleteCatalog={onDeleteCatalog}
              onToggleEnabled={onToggleEnabled}
              draggable
              dropHighlight={dropTargetId === f.id}
              onDragStart={() => { dragFolderId.current = f.id; }}
              onDragOver={(e) => { e.preventDefault(); if (dragFolderId.current !== f.id) setDropTargetId(f.id); }}
              onDragLeave={() => setDropTargetId((cur) => (cur === f.id ? null : cur))}
              onDrop={() => {
                const draggedId = dragFolderId.current;
                dragFolderId.current = null;
                setDropTargetId(null);
                if (draggedId && draggedId !== f.id) onNest(draggedId, f.id);
              }}
              isCollectionDropTarget={isCollectionDragActive}
              onDropCollection={() => onDropCollectionOntoFolder?.(f.id)}
            />
            {children.length > 0 && (
              <div className="ml-6 flex flex-col gap-3 border-l border-border pl-4">
                {children.map((child) => (
                  <FolderRow
                    key={child.id}
                    folder={child}
                    onAddCatalog={onAddCatalog}
                    onDeleteCatalog={onDeleteCatalog}
                    onToggleEnabled={onToggleEnabled}
                    draggable
                    onDragStart={() => { dragFolderId.current = child.id; }}
                    onUnnest={() => onUnnest(child.id)}
                    isCollectionDropTarget={isCollectionDragActive}
                    onDropCollection={() => onDropCollectionOntoFolder?.(child.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type TabFlagKey =
  | 'show_ios_home' | 'show_ios_movies' | 'show_ios_series'
  | 'show_mac_home' | 'show_mac_movies' | 'show_mac_series';

const TAB_FLAG_ROWS: { label: string; keys: [TabFlagKey, TabFlagKey, TabFlagKey] }[] = [
  { label: 'iOS', keys: ['show_ios_home', 'show_ios_movies', 'show_ios_series'] },
  { label: 'Mac', keys: ['show_mac_home', 'show_mac_movies', 'show_mac_series'] },
];

const TAB_LETTERS = ['H', 'M', 'S'];
const TAB_NAMES = ['Home', 'Movies', 'Series'];

function TabFlagChips({ col, onToggle }: { col: Collection; onToggle: (key: TabFlagKey, value: boolean) => void }) {
  return (
    <div className="flex flex-none flex-col gap-1">
      {TAB_FLAG_ROWS.map((row) => (
        <div key={row.label} className="flex items-center gap-1">
          <span className="w-7 text-right font-mono text-[9px] uppercase text-faint">{row.label}</span>
          {row.keys.map((key, i) => (
            <button
              key={key}
              onClick={() => onToggle(key, !col[key])}
              title={`${row.label} · ${TAB_NAMES[i]} tab`}
              className={`h-5 w-5 rounded font-mono text-[9px] leading-none transition-colors ${
                col[key]
                  ? 'bg-accent text-[#2a1206]'
                  : 'border border-border text-faint hover:border-accent/40'
              }`}
            >
              {TAB_LETTERS[i]}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Collection header row ────────────────────────────────────────────────────
// Shared between a top-level collection and one nested under a parent via
// `parent_collection_id` — same controls either way, just without a drag
// handle when nested (child order follows its own sort_order, not the
// top-level drag/drop list).

function CollectionHeaderRow({
  col,
  draggableHandle = false,
  expanded,
  onRename,
  onToggleTabFlag,
  onToggleEnabled,
  onToggleExpand,
}: {
  col: CollectionWithFolders;
  draggableHandle?: boolean;
  expanded: boolean;
  onRename: () => void;
  onToggleTabFlag: (key: TabFlagKey, value: boolean) => void;
  onToggleEnabled: (value: boolean) => void;
  onToggleExpand: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${col.enabled ? '' : 'opacity-50'}`}>
      {/* Drag handle (top-level only) */}
      {draggableHandle && (
        <span className="cursor-grab select-none text-faint opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing">
          ⠿
        </span>
      )}

      {/* Thumbnail */}
      <div className="h-9 w-9 flex-none overflow-hidden rounded-lg bg-surface-2">
        {col.backdrop_image && (
          <img src={col.backdrop_image} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      {/* Name */}
      <div className="min-w-0 flex-1">
        <button
          onClick={onRename}
          className="block truncate text-left text-[14px] font-semibold hover:text-accent"
          title="Click to rename"
        >
          {col.name}
        </button>
        <span className="font-mono text-[10px] text-faint">
          {col.folders.length} folder{col.folders.length !== 1 ? 's' : ''} ·{' '}
          {col.folders.reduce((n, f) => n + f.catalogs.length, 0)} sources
        </span>
      </div>

      {/* Tab visibility */}
      <TabFlagChips col={col} onToggle={onToggleTabFlag} />

      {/* Enabled toggle */}
      <Toggle on={col.enabled} onChange={onToggleEnabled} />

      {/* Expand button */}
      <button
        onClick={onToggleExpand}
        className={`rounded-lg border px-3 py-1 font-mono text-[11px] transition-colors ${
          expanded
            ? 'border-accent/40 bg-accent-light text-accent'
            : 'border-border text-faint hover:border-border-strong hover:text-text'
        }`}
      >
        {expanded ? '▲ Close' : '▼ Edit sources'}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HomeLayoutPage() {
  useAutoScrollOnDrag();
  const [collections, setCollections] = useState<CollectionWithFolders[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const dragId = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; zone: DropZone } | null>(null);
  // True while a collection row is mid-drag, so every visible folder tile
  // (in any expanded collection's editor) can render as a "drop to nest
  // here" target — no need to switch pages/tabs to see the target folder.
  const [isCollectionDragActive, setIsCollectionDragActive] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const { data: cols } = await supabase
      .from('collections')
      .select('*')
      .order('sort_order');

    if (!cols || cols.length === 0) { setCollections([]); setLoading(false); return; }

    const colIds = cols.map((c: Collection) => c.id);

    const [{ data: allFolders }, { data: allCatalogs }] = await Promise.all([
      supabase.from('folders').select('*').in('collection_id', colIds).order('sort_order'),
      supabase.from('folder_catalogs').select('*'),
    ]);

    const folders = (allFolders ?? []) as Folder[];
    const catalogs = (allCatalogs ?? []) as FolderCatalog[];

    const catsByFolder: Record<string, FolderCatalog[]> = {};
    for (const c of catalogs) {
      if (!catsByFolder[c.folder_id]) catsByFolder[c.folder_id] = [];
      catsByFolder[c.folder_id].push(c);
    }

    const foldersByCol: Record<string, FolderWithCatalogs[]> = {};
    for (const f of folders) {
      if (!foldersByCol[f.collection_id]) foldersByCol[f.collection_id] = [];
      foldersByCol[f.collection_id].push({ ...f, catalogs: catsByFolder[f.id] ?? [], enabled: f.enabled ?? true });
    }

    setCollections(
      cols.map((c: Collection) => ({ ...c, enabled: c.enabled ?? true, folders: foldersByCol[c.id] ?? [] }))
    );
    setLoading(false);
  }

  // ── Toggle enabled ────────────────────────────────────────────────────────

  async function toggleEnabled(id: string, enabled: boolean) {
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, enabled } : c)));
    const { error } = await supabase.from('collections').update({ enabled }).eq('id', id);
    if (error) {
      console.error('Failed to toggle collection enabled:', error);
      setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !enabled } : c)));
    }
  }

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

  async function toggleTabFlag(id: string, key: TabFlagKey, value: boolean) {
    const prev = collections.find((c) => c.id === id);
    if (!prev) return;

    // Turning this flag ON for a tab the widget isn't already on, while
    // it's already showing on some OTHER tab, would make one `collections`
    // row (and its whole folder/source/catalog subtree) shared across
    // tabs — editing it from either tab would edit both. Instead, clone
    // it into a brand-new, independent widget scoped to just this tab
    // (mirrors cloneCollection.ts's use in HomePresetsPage's "Add existing").
    const currentTabs = tabsVisibleOn(prev);
    if (value && currentTabs.size > 0 && !currentTabs.has(tabOf(key))) {
      setLoading(true);
      const clone = await cloneCollection(id, null);
      if (clone) {
        const clonePatch: Partial<Collection> = { [key]: true };
        if (key === 'show_ios_home' || key === 'show_mac_home') clonePatch.show_on_home = true;
        await supabase.from('collections').update(clonePatch).eq('id', clone.id);
      }
      await loadAll();
      return;
    }

    const patch: Partial<Collection> = { [key]: value };
    if (key === 'show_ios_home' || key === 'show_mac_home') {
      const iosHome = key === 'show_ios_home' ? value : prev.show_ios_home;
      const macHome = key === 'show_mac_home' ? value : prev.show_mac_home;
      patch.show_on_home = iosHome || macHome;
    }
    setCollections((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from('collections').update(patch).eq('id', id);
    if (error) {
      console.error('Failed to toggle tab flag:', error);
      setCollections((p) => p.map((c) => (c.id === id ? { ...c, ...prev } : c)));
    }
  }

  async function toggleFolderEnabled(folderId: string, enabled: boolean) {
    setCollections((prev) =>
      prev.map((col) => ({
        ...col,
        folders: col.folders.map((f) =>
          f.id === folderId ? { ...f, enabled } : f
        ),
      }))
    );
    const { error } = await supabase.from('folders').update({ enabled }).eq('id', folderId);
    if (error) {
      console.error('Failed to toggle folder enabled:', error);
      setCollections((prev) =>
        prev.map((col) => ({
          ...col,
          folders: col.folders.map((f) =>
            f.id === folderId ? { ...f, enabled: !enabled } : f
          ),
        }))
      );
    }
  }

  // Nests a folder under a sibling folder in the same collection (e.g.
  // "Horror Franchises" under "Horror") — same generic parent_folder_id
  // mechanism the Browse-by-genre row already reads, not specific to any
  // one collection or genre.
  async function nestFolder(folderId: string, parentFolderId: string) {
    if (folderId === parentFolderId) return;
    setCollections((prev) =>
      prev.map((col) => ({
        ...col,
        folders: col.folders.map((f) => (f.id === folderId ? { ...f, parent_folder_id: parentFolderId } : f)),
      }))
    );
    const { error } = await supabase.from('folders').update({ parent_folder_id: parentFolderId }).eq('id', folderId);
    if (error) {
      console.error('Failed to nest folder:', error);
      await loadAll();
    }
  }

  async function unnestFolder(folderId: string) {
    setCollections((prev) =>
      prev.map((col) => ({
        ...col,
        folders: col.folders.map((f) => (f.id === folderId ? { ...f, parent_folder_id: null } : f)),
      }))
    );
    const { error } = await supabase.from('folders').update({ parent_folder_id: null }).eq('id', folderId);
    if (error) {
      console.error('Failed to un-nest folder:', error);
      await loadAll();
    }
  }

  // ── Reorder / nest ───────────────────────────────────────────────────────────
  // Dropping on the top/bottom edge of a row reorders among top-level
  // collections (and un-nests the dragged item, if it was a child). Dropping
  // on the middle of a row nests the dragged collection under it instead —
  // same generic parent_collection_id mechanism GenreCatalog already reads,
  // no per-genre special-casing anywhere in this path.

  function isDescendant(candidateParentId: string, ofId: string): boolean {
    // Would setting `ofId`'s parent to `candidateParentId` create a cycle?
    // Only one level of nesting is modeled anywhere else in the app, but this
    // walks the full chain defensively in case of future deeper nesting.
    let cur: string | null | undefined = candidateParentId;
    while (cur) {
      if (cur === ofId) return true;
      cur = collections.find((c) => c.id === cur)?.parent_collection_id;
    }
    return false;
  }

  async function nestCollection(childId: string, parentId: string) {
    if (childId === parentId) return;
    if (isDescendant(parentId, childId)) return; // would create a cycle
    setCollections((prev) => prev.map((c) => (c.id === childId ? { ...c, parent_collection_id: parentId } : c)));
    const { error } = await supabase.from('collections').update({ parent_collection_id: parentId }).eq('id', childId);
    if (error) {
      console.error('Failed to nest collection:', error);
      await loadAll();
    }
  }

  // Nests a collection under a FOLDER (e.g. "Horror genre" under the
  // "Horror" folder in "Genres") — the third nesting relationship, distinct
  // from collection-under-collection. Clears parent_collection_id since a
  // collection can only have one parent at a time.
  async function nestCollectionInFolder(collectionId: string, folderId: string) {
    setCollections((prev) => prev.map((c) => (c.id === collectionId ? { ...c, parent_folder_id: folderId, parent_collection_id: null } : c)));
    const { error } = await supabase
      .from('collections')
      .update({ parent_folder_id: folderId, parent_collection_id: null })
      .eq('id', collectionId);
    if (error) {
      console.error('Failed to nest collection in folder:', error);
      await loadAll();
    }
  }

  // Reorders among TOP-LEVEL collections only (un-nesting the dragged item
  // first if it was a child), then reattaches every collection's existing
  // children directly after it so sort_order stays coherent even though
  // children aren't currently ordered by it anywhere in the app.
  async function reorderCollections(draggedId: string, targetId: string, zone: 'before' | 'after') {
    const dragged = collections.find((c) => c.id === draggedId);
    if (!dragged) return;
    const wasNested = !!dragged.parent_collection_id;

    const topLevel = collections.filter((c) => !c.parent_collection_id && c.id !== draggedId);
    const targetIdx = topLevel.findIndex((c) => c.id === targetId);
    if (targetIdx === -1) return;
    const insertAt = zone === 'before' ? targetIdx : targetIdx + 1;
    topLevel.splice(insertAt, 0, { ...dragged, parent_collection_id: null });

    const childrenByParent = new Map<string, CollectionWithFolders[]>();
    for (const c of collections) {
      if (c.parent_collection_id) {
        const arr = childrenByParent.get(c.parent_collection_id) ?? [];
        arr.push(c);
        childrenByParent.set(c.parent_collection_id, arr);
      }
    }
    const next: CollectionWithFolders[] = [];
    for (const c of topLevel) {
      next.push(c);
      next.push(...(childrenByParent.get(c.id) ?? []));
    }

    setCollections(next);
    if (wasNested) {
      const { error } = await supabase.from('collections').update({ parent_collection_id: null }).eq('id', draggedId);
      if (error) console.error('Failed to un-nest collection:', error);
    }
    await Promise.all(next.map((c, i) => supabase.from('collections').update({ sort_order: i }).eq('id', c.id)));
  }

  async function handleCollectionDrop(targetId: string) {
    const draggedId = dragId.current;
    const zone = dragOver?.zone;
    dragId.current = null;
    setDragOver(null);
    if (!draggedId || draggedId === targetId || !zone) return;
    if (zone === 'inside') {
      await nestCollection(draggedId, targetId);
    } else {
      await reorderCollections(draggedId, targetId, zone);
    }
  }

  function handleRowDragOver(e: React.DragEvent<HTMLDivElement>, id: string) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const zone: DropZone = y < rect.height * 0.25 ? 'before' : y > rect.height * 0.75 ? 'after' : 'inside';
    if (dragOver?.id !== id || dragOver?.zone !== zone) setDragOver({ id, zone });
  }

  // ── Rename ────────────────────────────────────────────────────────────────

  async function renameCollection(id: string) {
    const col = collections.find((c) => c.id === id);
    const name = prompt('New name', col?.name)?.trim();
    if (!name || name === col?.name) return;
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    await supabase.from('collections').update({ name }).eq('id', id);
  }

  // ── Catalog CRUD ──────────────────────────────────────────────────────────

  async function addCatalog(folderId: string, catalogId: string, mediaType: string, genre: string | null) {
    const { data } = await supabase
      .from('folder_catalogs')
      .insert({ folder_id: folderId, catalog_id: catalogId, media_type: mediaType, genre })
      .select()
      .single();
    if (!data) return;
    setCollections((prev) =>
      prev.map((col) => ({
        ...col,
        folders: col.folders.map((f) =>
          f.id === folderId ? { ...f, catalogs: [...f.catalogs, data as FolderCatalog] } : f
        ),
      }))
    );
  }

  async function deleteCatalog(catalogId: string, folderId: string) {
    await supabase.from('folder_catalogs').delete().eq('id', catalogId);
    setCollections((prev) =>
      prev.map((col) => ({
        ...col,
        folders: col.folders.map((f) =>
          f.id === folderId ? { ...f, catalogs: f.catalogs.filter((c) => c.id !== catalogId) } : f
        ),
      }))
    );
  }

  // ── Preview JSON ──────────────────────────────────────────────────────────

  async function fetchPreview() {
    setPreviewLoading(true);
    setPreviewJson(null);
    try {
      const res = await fetch(FUNCTION_URL);
      const json = await res.json();
      setPreviewJson(JSON.stringify(json, null, 2));
    } catch (e: any) {
      setPreviewJson(`Error: ${e.message}`);
    }
    setPreviewLoading(false);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Admin · Home Layout</p>
          <h1 className="font-display text-[clamp(30px,4vw,46px)] font-extrabold uppercase">Home organizer</h1>
          <p className="mt-1 text-sm text-muted">
            Drag to reorder, toggle visibility, and edit catalog sources. Changes are{' '}
            <span className="text-accent">live in the app</span> on next launch.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[10px] text-faint">{FUNCTION_URL}</span>
          <Button variant="ghost" size="sm" onClick={() => { setLoading(true); loadAll(); }}>↺ Refresh</Button>
          <Button size="sm" onClick={fetchPreview} loading={previewLoading}>
            Preview JSON ↗
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mb-6 flex flex-wrap gap-4">
        {[
          { label: 'Collections', value: collections.length },
          { label: 'Enabled', value: collections.filter((c) => c.enabled).length },
          { label: 'Total folders', value: collections.reduce((n, c) => n + c.folders.length, 0) },
          { label: 'Total sources', value: collections.reduce((n, c) => n + c.folders.reduce((m, f) => m + f.catalogs.length, 0), 0) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface px-5 py-3">
            <div className="font-display text-2xl font-extrabold">{s.value}</div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Collection list */}
      <div className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
            Collections · drag to reorder
          </span>
          <span className="font-mono text-[10px] text-faint">toggle = show/hide in app</span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        ) : collections.length === 0 ? (
          <p className="p-8 text-center font-mono text-[11px] text-faint">
            No collections. Import a JSON pack from the Collection manager.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {collections.map((col) => {
              // A collection with a parent renders nested under it below,
              // not in its own top-level slot — but it keeps its real index
              // in `collections` (this `.map` isn't filtered), so drag/drop
              // reordering of top-level items is unaffected either way.
              if (col.parent_collection_id) return null;
              const children = collections.filter((c) => c.parent_collection_id === col.id);
              const zone = dragOver?.id === col.id ? dragOver.zone : null;
              return (
                <div
                  key={col.id}
                  draggable
                  onDragStart={() => { dragId.current = col.id; setIsCollectionDragActive(true); }}
                  onDragEnd={() => setIsCollectionDragActive(false)}
                  onDragOver={(e) => handleRowDragOver(e, col.id)}
                  onDragLeave={() => { if (dragOver?.id === col.id) setDragOver(null); }}
                  onDrop={() => handleCollectionDrop(col.id)}
                  className={`group relative ${
                    zone === 'inside' ? 'bg-accent-light/40' : ''
                  }`}
                >
                  {zone === 'before' && <div className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
                  {zone === 'after' && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
                  <CollectionHeaderRow
                    col={col}
                    draggableHandle
                    expanded={expanded.has(col.id)}
                    onRename={() => renameCollection(col.id)}
                    onToggleTabFlag={(key, v) => toggleTabFlag(col.id, key, v)}
                    onToggleEnabled={(v) => toggleEnabled(col.id, v)}
                    onToggleExpand={() => toggleExpand(col.id)}
                  />

                  {/* Expanded folder editor */}
                  {expanded.has(col.id) && (
                    <div className="border-t border-border bg-bg px-5 py-4">
                      <FolderList
                        folders={col.folders}
                        onAddCatalog={addCatalog}
                        onDeleteCatalog={deleteCatalog}
                        onToggleEnabled={toggleFolderEnabled}
                        onNest={nestFolder}
                        onUnnest={unnestFolder}
                        isCollectionDragActive={isCollectionDragActive}
                        onDropCollectionOntoFolder={(folderId) => {
                          const draggedId = dragId.current;
                          setIsCollectionDragActive(false);
                          if (draggedId && draggedId !== col.id) nestCollectionInFolder(draggedId, folderId);
                        }}
                      />
                    </div>
                  )}

                  {/* Nested child collections (parent_collection_id) — same
                      row controls. Draggable too — drop on another collection
                      to re-parent, or in the gap above/below a top-level row
                      to send it back to top level. */}
                  {children.length > 0 && (
                    <div className="border-t border-border bg-bg/60 pl-8">
                      {children.map((child) => {
                        const childZone = dragOver?.id === child.id ? dragOver.zone : null;
                        return (
                        <div
                          key={child.id}
                          draggable
                          onDragStart={() => { dragId.current = child.id; setIsCollectionDragActive(true); }}
                          onDragEnd={() => setIsCollectionDragActive(false)}
                          onDragOver={(e) => handleRowDragOver(e, child.id)}
                          onDragLeave={() => { if (dragOver?.id === child.id) setDragOver(null); }}
                          onDrop={() => handleCollectionDrop(child.id)}
                          className={`relative border-b border-border/60 last:border-b-0 ${
                            childZone === 'inside' ? 'bg-accent-light/40' : ''
                          }`}
                        >
                          {childZone === 'before' && <div className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
                          {childZone === 'after' && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
                          <CollectionHeaderRow
                            col={child}
                            expanded={expanded.has(child.id)}
                            onRename={() => renameCollection(child.id)}
                            onToggleTabFlag={(key, v) => toggleTabFlag(child.id, key, v)}
                            onToggleEnabled={(v) => toggleEnabled(child.id, v)}
                            onToggleExpand={() => toggleExpand(child.id)}
                          />
                          {expanded.has(child.id) && (
                            <div className="border-t border-border bg-bg px-5 py-4">
                              <FolderList
                                folders={child.folders}
                                onAddCatalog={addCatalog}
                                onDeleteCatalog={deleteCatalog}
                                onToggleEnabled={toggleFolderEnabled}
                                onNest={nestFolder}
                                onUnnest={unnestFolder}
                                isCollectionDragActive={isCollectionDragActive}
                                onDropCollectionOntoFolder={(folderId) => {
                                  const draggedId = dragId.current;
                                  setIsCollectionDragActive(false);
                                  if (draggedId && draggedId !== child.id) nestCollectionInFolder(draggedId, folderId);
                                }}
                              />
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* JSON preview modal */}
      {previewJson !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <span className="font-mono text-[11px] uppercase tracking-wide text-accent">Live JSON output</span>
              <button
                onClick={() => setPreviewJson(null)}
                className="font-mono text-[11px] text-faint hover:text-text"
              >
                ✕ Close
              </button>
            </div>
            <pre className="overflow-auto p-5 font-mono text-[11px] leading-relaxed text-text">
              {previewJson}
            </pre>
          </div>
        </div>
      )}
    </AppShell>
  );
}
