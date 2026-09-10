import { useState } from 'react';
import { useCollectionSubtree } from '../../hooks/useCollectionSubtree';
import { useFolderPreviewPosters } from '../../hooks/useFolderPreviewPosters';
import { useFolderSearch } from '../../hooks/useFolderSearch';
import { useAddonCatalogSearch, type AddonCatalogEntry } from '../../hooks/useAddonCatalogSearch';
import { FallbackPosterImg } from './FallbackPosterImg';
import { ArtworkGallery } from './ArtworkGallery';
import { TAB_FLAG, TILE_SHAPES, tileAspectClass, type WidgetTab } from './WidgetGrid';
import { LANGUAGE_ISO_BY_FOLDER_NAME, LanguageHubRailsEditor } from './LanguageHubRailsEditor';
import type { Folder, FolderSource, FolderCatalog } from '../../types';

const TABS: { id: WidgetTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'movies', label: 'Movies' },
  { id: 'series', label: 'Series' },
];

// Deterministic moody gradient per id — the mockup itself uses this same
// technique (posterGradient) for tile art rather than fetching real content,
// since a folder/source's actual catalog items aren't cheaply previewable
// here (would need the owning addon's URL resolved per row). Matches the
// approved render, not a shortcut around it.
const PALETTES: [string, string][] = [
  ['#3a0d0d', '#7a1f1f'], ['#0d2b2b', '#1f6b6b'], ['#241033', '#5a2a8a'],
  ['#2b1a05', '#8a5a1f'], ['#0d1f3a', '#2a5a9a'], ['#331028', '#8a2a6a'],
  ['#1a2b0d', '#4a8a2a'], ['#3a1a0d', '#c2571f'],
];
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function gradientFor(id: string): string {
  const [a, b] = PALETTES[hashId(id) % PALETTES.length];
  const deg = 115 + (hashId(id + 'x') % 50);
  return `linear-gradient(${deg}deg, ${a}, ${b})`;
}

interface Props {
  collectionId: string;
  onBack: () => void;
}

export function WidgetEditor({ collectionId, onBack }: Props) {
  const {
    collection, folders, sourcesByFolder, catalogsByFolder, loading,
    saveCollectionSettings, addFolder, deleteFolder, reorderFolderSiblings, saveFolderArtwork,
    addSource, deleteSource, addCatalog, deleteCatalog, importFolder,
  } = useCollectionSubtree(collectionId);

  const [path, setPath] = useState<string[]>([]);
  const [bodyView, setBodyView] = useState<'rows' | 'list'>('rows');
  const [composerParentId, setComposerParentId] = useState<string | null | undefined>(undefined); // undefined = closed
  const [importParentId, setImportParentId] = useState<string | null | undefined>(undefined); // undefined = closed
  // Set to open `ArtworkGallery` for one folder — independent of `path`'s
  // drill-in navigation, since the folder whose art needs editing is often
  // a *child* being looked at, not the one currently drilled into (its
  // cover_image/hero_backdrop is what renders as ITS OWN tile one level up).
  const [artworkFolderId, setArtworkFolderId] = useState<string | null>(null);

  if (loading || !collection) {
    return <p className="py-16 text-center text-sm text-muted">Loading widget…</p>;
  }

  const artworkFolder = artworkFolderId ? folders.find((f) => f.id === artworkFolderId) ?? null : null;
  if (artworkFolder) {
    return (
      <ArtworkGallery
        folder={artworkFolder}
        onBack={() => setArtworkFolderId(null)}
        onSave={(patch) => saveFolderArtwork(artworkFolder.id, patch)}
      />
    );
  }

  const childrenOf = (parentFolderId: string | null) =>
    folders.filter((f) => f.parent_folder_id === parentFolderId).sort((a, b) => a.sort_order - b.sort_order);

  const currentFolderId = path[path.length - 1] ?? null;
  const currentFolder = currentFolderId ? folders.find((f) => f.id === currentFolderId) ?? null : null;
  const currentChildren = childrenOf(currentFolderId);
  const isRoot = path.length === 0;
  // A folder with no child folders of its own is a "leaf" — it's where
  // content sources actually attach (folder_sources/folder_catalogs), the
  // real-schema equivalent of the mockup's "standard" node kind.
  const isLeaf = !isRoot && currentChildren.length === 0;

  function crumbName(id: string): string {
    return folders.find((f) => f.id === id)?.name ?? '…';
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-accent">
        ← Your Widgets
      </button>

      <div className="mb-4 flex flex-wrap items-center gap-1 font-mono text-[11.5px] text-faint">
        <button onClick={() => setPath([])} className={`px-0.5 ${isRoot ? 'font-semibold text-text' : 'text-muted hover:text-accent'}`}>
          {collection.name}
        </button>
        {path.map((id, i) => (
          <span key={id} className="flex items-center gap-1">
            <span>›</span>
            <button
              onClick={() => setPath(path.slice(0, i + 1))}
              className={`px-0.5 ${i === path.length - 1 ? 'font-semibold text-text' : 'text-muted hover:text-accent'}`}
            >
              {crumbName(id)}
            </button>
          </span>
        ))}
      </div>

      {isRoot ? (
        <RootHeader
          collection={collection}
          rootChildren={childrenOf(null)}
          onSaveSettings={saveCollectionSettings}
          onSetGroupShape={(shape) => {
            for (const f of childrenOf(null)) saveFolderArtwork(f.id, { tile_shape: shape });
          }}
        />
      ) : (
        <div className="mb-5 rounded-xl border border-dashed border-border-strong bg-surface p-3 text-[12.5px] text-faint">
          Part of <span className="font-semibold text-text">{collection.name}</span>. Only the widget's own root has tabs, publish state, and reuse — everything nested here inherits that.
        </div>
      )}

      {isLeaf && currentFolder ? (
        <FolderSourceEditor
          folder={currentFolder}
          sources={sourcesByFolder[currentFolder.id] ?? []}
          catalogs={catalogsByFolder[currentFolder.id] ?? []}
          onAddSource={(provider) => addSource(currentFolder.id, provider)}
          onDeleteSource={(id) => deleteSource(currentFolder.id, id)}
          onAddCatalog={(catalogId, mediaType, genre) => addCatalog(currentFolder.id, catalogId, mediaType, genre)}
          onDeleteCatalog={(id) => deleteCatalog(currentFolder.id, id)}
          onSaveShape={(shape) => saveFolderArtwork(currentFolder.id, { tile_shape: shape })}
          onEditArtwork={() => setArtworkFolderId(currentFolder.id)}
          languageIso={
            collection.name.trim().toLowerCase() === 'languages'
              ? LANGUAGE_ISO_BY_FOLDER_NAME[currentFolder.name.trim().toLowerCase()]
              : undefined
          }
        />
      ) : (
        <FolderBody
          children={currentChildren}
          allFolders={folders}
          bodyView={bodyView}
          onChangeBodyView={setBodyView}
          onDrillIn={(id) => setPath((p) => [...p, id])}
          onDelete={deleteFolder}
          onReorder={(draggedId, targetId, zone) => reorderFolderSiblings(draggedId, targetId, zone, currentFolderId)}
          onSaveShape={(id, shape) => saveFolderArtwork(id, { tile_shape: shape })}
          onEditArtwork={setArtworkFolderId}
        />
      )}

      {!isLeaf && (
        <div className="mt-5 border-t border-dashed border-border-strong pt-5">
          {composerParentId === currentFolderId ? (
            <AddFolderComposer
              onCancel={() => setComposerParentId(undefined)}
              onSave={async (name) => {
                await addFolder(name, currentFolderId);
                setComposerParentId(undefined);
              }}
            />
          ) : importParentId === currentFolderId ? (
            <ImportFolderPanel
              excludeCollectionId={collectionId}
              onCancel={() => setImportParentId(undefined)}
              onImport={async (sourceFolderId) => {
                await importFolder(sourceFolderId, currentFolderId);
                setImportParentId(undefined);
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setComposerParentId(currentFolderId)}
              className="rounded-lg border border-dashed border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            >
              + Add folder
            </button>
            <button
              onClick={() => setImportParentId(currentFolderId)}
              className="rounded-lg border border-dashed border-border-strong px-3.5 py-2.5 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            >
              + Import folder from a collection
            </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RootHeader({
  collection, rootChildren, onSaveSettings, onSetGroupShape,
}: {
  collection: NonNullable<ReturnType<typeof useCollectionSubtree>['collection']>;
  rootChildren: Folder[];
  onSaveSettings: (patch: Record<string, unknown>) => Promise<void>;
  onSetGroupShape: (shape: string) => void;
}) {
  const [name, setName] = useState(collection.name);
  const rootFolderCount = rootChildren.length;
  const kindLabel = rootFolderCount === 0 ? 'Empty — add a folder to give it content'
    : rootFolderCount === 1 ? 'Single row — passes through as one content row'
    : 'Hub — multiple root folders, group-tile row';
  // Every current child shares the widget's own shape (matches how the
  // on-device apps actually read it — CatalogRepository's groupTileShape
  // takes the *first* root folder's tile_shape for the whole row), so
  // there's one control for the widget rather than a picker per child that
  // could quietly disagree with itself.
  const groupShape = rootChildren[0]?.tile_shape ?? 'poster';

  return (
    <div className="mb-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (name.trim() && name !== collection.name) onSaveSettings({ name: name.trim() }); }}
            className="w-full rounded-lg border border-transparent bg-transparent font-display text-2xl font-bold text-text outline-none hover:border-border focus:border-accent focus:bg-bg2"
          />
          <p className="mt-1 text-[11.5px] text-faint">{kindLabel}</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide ${
              collection.status === 'published'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400'
            }`}
          >
            {collection.status}
          </span>
          {collection.status !== 'published' && (
            <button
              onClick={() => onSaveSettings({ status: 'published' })}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-[#160a04] transition-colors hover:bg-accent-2"
            >
              Publish
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-faint">Appears on tabs</p>
          <div className="flex gap-1.5">
            {TABS.map(({ id, label }) => {
              const { ios, mac } = TAB_FLAG[id];
              const on = Boolean(collection[ios]) || Boolean(collection[mac]);
              return (
                <button
                  key={id}
                  onClick={() => onSaveSettings({ [ios]: !on, [mac]: !on })}
                  className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
                    on ? 'border-accent/40 bg-accent-light text-accent' : 'border-border-strong bg-surface text-muted hover:text-text'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {rootFolderCount > 0 && (
          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-faint">Tile shape</p>
            <TileShapePicker value={groupShape} onChange={onSetGroupShape} />
          </div>
        )}
      </div>
    </div>
  );
}

function FolderBody({
  children, allFolders, bodyView, onChangeBodyView, onDrillIn, onDelete, onReorder, onSaveShape, onEditArtwork,
}: {
  children: Folder[];
  allFolders: Folder[];
  bodyView: 'rows' | 'list';
  onChangeBodyView: (v: 'rows' | 'list') => void;
  onDrillIn: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (draggedId: string, targetId: string, zone: 'before' | 'after') => void;
  onSaveShape: (folderId: string, shape: string) => void;
  onEditArtwork: (folderId: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const grandchildCount = (id: string) => allFolders.filter((f) => f.parent_folder_id === id).length;

  return (
    <div>
      {children.length > 0 && (
        <div className="mb-3 flex justify-end">
          <div className="inline-flex rounded-lg border border-border-strong overflow-hidden">
            {(['rows', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onChangeBodyView(v)}
                className={`px-3.5 py-1.5 text-[12px] capitalize transition-colors ${bodyView === v ? 'bg-accent-light text-accent' : 'text-muted hover:text-text'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {children.length === 0 ? (
        <p className="py-6 text-sm text-faint">No folders here yet.</p>
      ) : bodyView === 'list' ? (
        <div className="flex flex-col gap-1.5">
          {children.map((c) => {
            const gc = grandchildCount(c.id);
            return (
              <div
                key={c.id}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) onReorder(dragId, c.id, 'before'); setDragId(null); }}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5"
              >
                <span className="flex-1 truncate text-[13.5px] text-text">{c.name}</span>
                <span className="font-mono text-[10.5px] text-faint">{gc > 0 ? `Hub · ${gc} folders` : 'Content row'}</span>
                <TileShapePicker value={c.tile_shape} onChange={(shape) => onSaveShape(c.id, shape)} />
                <button onClick={() => onEditArtwork(c.id)} className="rounded-md border border-border-strong px-2 py-1 font-mono text-[10.5px] text-muted hover:text-accent">
                  Art
                </button>
                <button onClick={() => onDrillIn(c.id)} className="rounded-md border border-border-strong px-2 py-1 font-mono text-[10.5px] text-muted hover:text-accent">
                  {gc > 0 ? 'Open' : 'Edit source'}
                </button>
                <button onClick={() => { if (confirm(`Delete "${c.name}"?`)) onDelete(c.id); }} className="text-faint hover:text-red-400">×</button>
              </div>
            );
          })}
        </div>
      ) : children.length > 1 && children.every((c) => grandchildCount(c.id) === 0) ? (
        // A flat hub — every child here is itself a leaf (e.g. "Series
        // Universes": Breaking Bad/Game of Thrones/Dexter Universe/Power
        // Universe each hold their own sources directly, no further
        // nesting). Rendered as one grid of folder tiles matching how the
        // real on-device apps show this exact shape (see WidgetGrid's own
        // HubTile), not as N separate per-child content-row strips — a
        // child only earns its own header+strip block below once at least
        // one sibling has real sub-folders worth drilling into.
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {children.map((c) => {
            const image = c.cover_image ?? c.hero_backdrop;
            return (
              <div
                key={c.id}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) onReorder(dragId, c.id, 'before'); setDragId(null); }}
                className="group relative"
              >
                <button
                  onClick={() => onDrillIn(c.id)}
                  className={`relative flex ${tileAspectClass(c.tile_shape)} w-full items-end overflow-hidden rounded-xl p-2.5 text-left`}
                  style={image ? undefined : { background: gradientFor(c.id) }}
                >
                  {image && <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.85))' }} />
                  <span className="relative z-[1] font-body text-[12.5px] font-semibold leading-tight text-white">{c.name}</span>
                </button>
                <button
                  onClick={() => onEditArtwork(c.id)}
                  title="Edit artwork"
                  className="absolute right-8 top-1.5 z-[2] flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-[12px] text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100"
                >
                  🖼
                </button>
                <button
                  onClick={() => { if (confirm(`Delete "${c.name}"?`)) onDelete(c.id); }}
                  className="absolute right-1.5 top-1.5 z-[2] flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-[12px] text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100"
                >
                  ×
                </button>
                {/* Below the tile, not overlaid on it — an overlay sat on
                    top of the folder name and the two fought for the same
                    pixels on hover. */}
                <div className="mt-1.5 flex justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <TileShapePicker size="sm" value={c.tile_shape} onChange={(shape) => onSaveShape(c.id, shape)} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {children.map((c) => {
            const gc = grandchildCount(c.id);
            const grandchildren = gc > 0 ? allFolders.filter((f) => f.parent_folder_id === c.id) : [];
            return (
              <div
                key={c.id}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) onReorder(dragId, c.id, 'before'); setDragId(null); }}
              >
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <button onClick={() => onDrillIn(c.id)} className="flex items-baseline gap-2 text-left hover:text-accent">
                    <span className="font-display text-[15px] font-bold text-text">{c.name}</span>
                    <span className="font-mono text-[10.5px] text-faint">{gc > 0 ? `Hub · ${gc} folders` : 'Content row'}</span>
                  </button>
                  <button onClick={() => onEditArtwork(c.id)} className="text-[11px] text-faint hover:text-accent">Art</button>
                  <button onClick={() => { if (confirm(`Delete "${c.name}"?`)) onDelete(c.id); }} className="text-[11px] text-faint hover:text-red-400">Delete</button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {gc > 0
                    ? grandchildren.map((g) => {
                        const image = g.cover_image ?? g.hero_backdrop;
                        return (
                          <div key={g.id} className="group relative flex-none">
                            <button
                              onClick={() => onDrillIn(c.id)}
                              className="relative flex h-[130px] w-[92px] items-end overflow-hidden rounded-lg p-2 text-left"
                              style={image ? undefined : { background: gradientFor(g.id) }}
                            >
                              {image && <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.8))' }} />
                              <span className="relative z-[1] font-body text-[11px] font-semibold leading-tight text-white">{g.name}</span>
                            </button>
                            <button
                              onClick={() => onEditArtwork(g.id)}
                              title="Edit artwork"
                              className="absolute right-1 top-1 z-[2] flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-[10px] text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100"
                            >
                              🖼
                            </button>
                          </div>
                        );
                      })
                    : <LeafRowPreview folderId={c.id} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// A leaf (content-row) folder's real preview — its actual titles, resolved
// through the same addon pipeline the on-device apps use, since a content
// row has no per-folder art of its own worth showing (unlike a hub's child
// folders, which each carry real curated artwork). Pads with a moody
// gradient tile only while loading or if the source genuinely returns
// nothing, never as the steady-state look.
function LeafRowPreview({ folderId }: { folderId: string }) {
  const posters = useFolderPreviewPosters(folderId);
  if (posters.length === 0) {
    return (
      <>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[130px] w-[92px] flex-none rounded-lg" style={{ background: gradientFor(`${folderId}-${i}`) }} />
        ))}
      </>
    );
  }
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <FallbackPosterImg key={i} pool={posters} slot={i} totalSlots={6} className="h-[130px] w-[92px] flex-none rounded-lg object-cover" />
      ))}
    </>
  );
}

// Searches every folder across every collection so an admin can pull, say,
// "Horror" out of the Genres collection into their own widget without
// rebuilding it — a one-time deep copy (see useCollectionSubtree.importFolder),
// fully independent of the source from that point on.
function ImportFolderPanel({
  excludeCollectionId, onCancel, onImport,
}: {
  excludeCollectionId: string;
  onCancel: () => void;
  onImport: (sourceFolderId: string) => void;
}) {
  const { results, loading } = useFolderSearch();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'widgets' | 'collections'>('widgets');
  const [importingId, setImportingId] = useState<string | null>(null);

  const filtered = results
    .filter((r) => r.folder.collection_id !== excludeCollectionId)
    .filter((r) => scope === 'collections' || r.isWidget)
    .filter((r) => !query.trim() || r.folder.name.toLowerCase().includes(query.trim().toLowerCase()) || r.collectionName.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 40);

  return (
    <div className="max-w-lg rounded-xl border border-border-strong bg-surface p-3.5">
      <div className="mb-2 inline-flex self-start rounded-lg border border-border-strong overflow-hidden">
        {(['widgets', 'collections'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`px-3 py-1.5 text-[12px] capitalize transition-colors ${scope === s ? 'bg-accent-light text-accent' : 'text-muted'}`}
          >
            {s === 'widgets' ? 'From Widgets' : 'From Collections page'}
          </button>
        ))}
      </div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={scope === 'widgets' ? 'Search folders across published widgets, e.g. “Horror”' : 'Search folders across every collection, e.g. “Horror”'}
        className="mb-2 w-full rounded-lg border border-border bg-bg2 px-3 py-2 text-[13px] text-text outline-none focus:border-accent"
      />
      <div className="max-h-72 overflow-y-auto rounded-lg border border-border-strong">
        {loading ? (
          <p className="p-3 text-[12.5px] text-faint">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-[12.5px] text-faint">No matches.</p>
        ) : (
          filtered.map(({ folder, collectionName, childCount }) => (
            <div key={folder.id} className="flex items-center gap-2.5 border-b border-border px-3 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-text">{folder.name}</p>
                <p className="truncate font-mono text-[10px] text-faint">
                  {collectionName}{childCount > 0 ? ` · ${childCount} sub-folder${childCount === 1 ? '' : 's'}` : ''}
                </p>
              </div>
              <button
                disabled={importingId === folder.id}
                onClick={async () => { setImportingId(folder.id); await onImport(folder.id); setImportingId(null); }}
                className="flex-none rounded-lg border border-border-strong px-2.5 py-1 text-[11.5px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {importingId === folder.id ? 'Importing…' : 'Import'}
              </button>
            </div>
          ))
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <button onClick={onCancel} className="rounded-lg border border-border-strong px-3 py-1.5 text-[12.5px] text-muted hover:text-text">Cancel</button>
      </div>
    </div>
  );
}

function AddFolderComposer({ onSave, onCancel }: { onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  return (
    <div className="flex max-w-md gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Folder name, e.g. “Franchises”"
        className="flex-1 rounded-lg border border-border bg-bg2 px-3 py-2 text-[13px] text-text outline-none focus:border-accent"
      />
      <button onClick={onCancel} className="rounded-lg border border-border-strong px-3 py-2 text-[12.5px] text-muted hover:text-text">Cancel</button>
      <button
        onClick={() => { if (name.trim()) onSave(name.trim()); }}
        className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-[#160a04] hover:bg-accent-2"
      >
        Add
      </button>
    </div>
  );
}

// Two real content-source types only — the mockup's third "Computed" option
// has no backing table (folder_sources/folder_catalogs) today, so it's
// omitted rather than offered as a dropdown option that would silently do
// nothing.
// Searches the default addon's own ~1,500 named catalogs (New Releases,
// per-director/actor lists, genre discover rows, …) instead of making an
// admin type a raw catalog id blind — this is the exact same backend every
// typed-in catalog_id throughout the portal already resolves against (see
// useFolderPreviewPosters.ts's AIOMETADATA_BASE), just searchable by name.
function AddonCatalogSearchField({
  onPick, onManualEntry,
}: {
  onPick: (entry: AddonCatalogEntry) => void;
  onManualEntry: () => void;
}) {
  const { catalogs, loading } = useAddonCatalogSearch();
  const [query, setQuery] = useState('');

  const results = query.trim().length < 2
    ? []
    : catalogs.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 20);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={loading ? 'Loading catalogs…' : `Search ${catalogs.length.toLocaleString()} sources, e.g. "Steven Spielberg" or "New Releases"`}
        disabled={loading}
        className="w-full rounded-lg border border-border bg-bg2 px-2.5 py-1.5 text-[12.5px] text-text outline-none focus:border-accent disabled:opacity-60"
      />
      {results.length > 0 && (
        <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-border-strong">
          {results.map((entry) => (
            <button
              key={`${entry.type}:${entry.id}`}
              onClick={() => onPick(entry)}
              className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
            >
              <span className="rounded border border-cyan-500/30 px-1.5 py-0.5 font-mono text-[9px] text-cyan-400">{entry.type}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-text">{entry.name}</span>
              <span className="flex-none font-mono text-[9.5px] text-faint">+ Add</span>
            </button>
          ))}
        </div>
      )}
      {query.trim().length >= 2 && results.length === 0 && !loading && (
        <p className="mt-1.5 text-[11.5px] text-faint">No matches.</p>
      )}
      <button onClick={onManualEntry} className="mt-1.5 text-[11.5px] text-muted hover:text-accent">
        Can't find it? Enter a catalog id manually →
      </button>
    </div>
  );
}

// Poster/landscape/square toggle — reused wherever a folder's own tile
// shape needs editing (the leaf editor, the widget root, and each grid
// tile's own hover row). `size="sm"` abbreviates to one letter for the
// narrow grid-tile context, where the full words don't fit under a
// 92-150px-wide tile without overflowing or wrapping onto the tile art
// itself. Values must stay lowercase; see TILE_SHAPES.
function TileShapePicker({ value, onChange, size = 'md' }: { value: string; onChange: (shape: string) => void; size?: 'md' | 'sm' }) {
  return (
    <div className="inline-flex rounded-lg border border-border-strong overflow-hidden bg-bg2">
      {TILE_SHAPES.map((shape) => (
        <button
          key={shape}
          title={shape}
          onClick={() => onChange(shape)}
          className={`font-mono uppercase tracking-wide transition-colors ${size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'} ${
            (value || 'poster') === shape ? 'bg-accent-light text-accent' : 'text-muted hover:text-text'
          }`}
        >
          {size === 'sm' ? shape[0] : shape}
        </button>
      ))}
    </div>
  );
}

function FolderSourceEditor({
  folder, sources, catalogs, onAddSource, onDeleteSource, onAddCatalog, onDeleteCatalog, onSaveShape, onEditArtwork, languageIso,
}: {
  folder: Folder;
  sources: FolderSource[];
  catalogs: FolderCatalog[];
  onAddSource: (provider: string) => void;
  onDeleteSource: (id: string) => void;
  onAddCatalog: (catalogId: string, mediaType: string, genre: string | null) => void;
  onDeleteCatalog: (id: string) => void;
  onSaveShape: (shape: string) => void;
  onEditArtwork: () => void;
  languageIso?: string;
}) {
  const [kind, setKind] = useState<'catalog' | 'source'>('catalog');
  const [catalogId, setCatalogId] = useState('');
  const [mediaType, setMediaType] = useState('movie');
  const [provider, setProvider] = useState('');
  const [manualEntry, setManualEntry] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-faint">Tile shape</p>
        <div className="flex items-center gap-2">
          <TileShapePicker value={folder.tile_shape} onChange={onSaveShape} />
          <button
            onClick={onEditArtwork}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-[12px] text-muted hover:border-accent hover:text-accent"
          >
            Edit artwork
          </button>
        </div>
      </div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-faint">Content sources</p>
      <div className="mb-4 flex flex-col gap-1.5">
        {catalogs.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <span className="rounded border border-cyan-500/30 px-1.5 py-0.5 font-mono text-[9px] text-cyan-400">catalog</span>
            <span className="flex-1 truncate text-[13px] text-text">{c.catalog_id}</span>
            <span className="font-mono text-[10.5px] text-faint">{c.media_type}{c.genre ? ` · ${c.genre}` : ''}</span>
            <button onClick={() => onDeleteCatalog(c.id)} className="text-faint hover:text-red-400">×</button>
          </div>
        ))}
        {sources.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <span className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-[9px] text-muted">list</span>
            <span className="flex-1 truncate text-[13px] text-text">{s.title ?? s.provider}</span>
            <button onClick={() => onDeleteSource(s.id)} className="text-faint hover:text-red-400">×</button>
          </div>
        ))}
        {catalogs.length === 0 && sources.length === 0 && (
          <p className="text-sm text-faint">No content sources on “{folder.name}” yet.</p>
        )}
      </div>

      <div className="flex max-w-lg flex-col gap-2 rounded-xl border border-border-strong bg-surface p-3.5">
        <div className="inline-flex self-start rounded-lg border border-border-strong overflow-hidden">
          {(['catalog', 'source'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 text-[12px] transition-colors ${kind === k ? 'bg-accent-light text-accent' : 'text-muted'}`}
            >
              {k === 'catalog' ? 'Addon catalog' : 'Curated / Trakt list'}
            </button>
          ))}
        </div>
        {kind === 'catalog' ? (
          manualEntry ? (
            <>
              <input value={catalogId} onChange={(e) => setCatalogId(e.target.value)} placeholder="catalog id, e.g. trakt.anticipated.movies"
                className="rounded-lg border border-border bg-bg2 px-2.5 py-1.5 font-mono text-[11.5px] text-text outline-none focus:border-accent" />
              <select value={mediaType} onChange={(e) => setMediaType(e.target.value)}
                className="rounded-lg border border-border bg-bg2 px-2.5 py-1.5 text-[12.5px] text-text outline-none focus:border-accent">
                <option value="movie">Movie</option>
                <option value="series">Series</option>
              </select>
              <div className="flex justify-between">
                <button onClick={() => setManualEntry(false)} className="self-start text-[11.5px] text-muted hover:text-accent">← Back to search</button>
                <button
                  onClick={() => { if (catalogId.trim()) { onAddCatalog(catalogId.trim(), mediaType, null); setCatalogId(''); } }}
                  className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#160a04] hover:bg-accent-2"
                >
                  Add
                </button>
              </div>
            </>
          ) : (
            <AddonCatalogSearchField
              onPick={(entry) => onAddCatalog(entry.id, entry.type, null)}
              onManualEntry={() => setManualEntry(true)}
            />
          )
        ) : (
          <>
            <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. trakt.list.4203408 · Rotten Tomatoes: Best Horror"
              className="rounded-lg border border-border bg-bg2 px-2.5 py-1.5 font-mono text-[11.5px] text-text outline-none focus:border-accent" />
            <button
              onClick={() => { if (provider.trim()) { onAddSource(provider.trim()); setProvider(''); } }}
              className="self-end rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#160a04] hover:bg-accent-2"
            >
              Add
            </button>
          </>
        )}
      </div>

      {languageIso && <LanguageHubRailsEditor iso={languageIso} languageName={folder.name} />}
    </div>
  );
}
