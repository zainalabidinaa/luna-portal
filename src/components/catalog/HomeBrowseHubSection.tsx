import { useState } from 'react';
import { useHomeBrowseTiles, type HomeBrowseTile } from '../../hooks/useHomeBrowseTiles';
import { useHomeBrowseHubPosition } from '../../hooks/useHomeBrowseHubPosition';
import { useSourceCollectionFolders, findFolderByName } from '../../hooks/useSourceCollectionFolders';
import { useTMDBTileBackdrop } from '../../hooks/useTMDBTileBackdrop';
import { HubTile } from './WidgetGrid';
import { LANGUAGE_ISO_BY_FOLDER_NAME } from './LanguageHubRailsEditor';
import type { Folder } from '../../types';

// Mirrors LanguageFlag.swift's iso -> emoji map — the fallback shown only if
// TMDB genuinely has no backdrop for a language (see useTMDBTileBackdrop).
const LANGUAGE_FLAG_EMOJI: Record<string, string> = {
  ko: '🇰🇷', ja: '🇯🇵', es: '🇪🇸', fr: '🇫🇷', zh: '🇨🇳', hi: '🇮🇳',
  de: '🇩🇪', it: '🇮🇹', pt: '🇵🇹', tr: '🇹🇷', sv: '🇸🇪', da: '🇩🇰',
  no: '🇳🇴', ru: '🇷🇺', pl: '🇵🇱', th: '🇹🇭', nl: '🇳🇱', ar: '🇸🇦',
};

/**
 * Home's "Browse by Genre" / "Browse by Language" strips — see
 * supabase/migrations/20260912_home_browse_tiles.sql. These aren't
 * collections (MacHomeView.swift renders them from a flat name list, not
 * folders/catalogs) — a separate concept from the "Genres"/"Languages"
 * collections used elsewhere in the portal, so they don't fit the normal
 * WidgetGrid card model.
 *
 * Tile art is a real TMDB backdrop, fetched with the exact same discover
 * query TMDBTileBackdropFetcher.swift uses for MacGenreTile/MacLanguageTile
 * (see useTMDBTileBackdrop) — this is a single full image per tile, not the
 * on-device sheared 3-image band + gradient + endonym watermark, which is a
 * separate design/CSS effort. Falls back to the Genres collection's curated
 * icon (genre) or a flag emoji (language) if TMDB has nothing.
 */
export function HomeBrowseHubSection({ onOpen }: { onOpen: (kind: 'genre' | 'language') => void }) {
  const { genres, languages, loading } = useHomeBrowseTiles();
  const genreFolders = useSourceCollectionFolders('Genres');
  const { insertAtIndex, setInsertAtIndex } = useHomeBrowseHubPosition();

  if (loading) return null;

  return (
    <div className="mb-5 grid max-w-[420px] grid-cols-2 gap-3.5">
      <BrowseCard
        title="Browse by Genre" tiles={genres} kind="genre" genreFolders={genreFolders} onClick={() => onOpen('genre')}
        insertAtIndex={insertAtIndex('genre')} onSetInsertAtIndex={(v) => setInsertAtIndex('genre', v)}
      />
      <BrowseCard
        title="Browse by Language" tiles={languages} kind="language" genreFolders={genreFolders} onClick={() => onOpen('language')}
        insertAtIndex={insertAtIndex('language')} onSetInsertAtIndex={(v) => setInsertAtIndex('language', v)}
      />
    </div>
  );
}

function CardShell({ title, onClick, children, insertAtIndex, onSetInsertAtIndex }: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  insertAtIndex: number | null;
  onSetInsertAtIndex: (value: number | null) => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-bg2 text-left transition-all hover:-translate-y-1 hover:border-accent">
      <button onClick={onClick} className="relative block w-full text-left">
        {children}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(13,6,4,.8) 0%,rgba(13,6,4,.35) 32%,transparent 60%)' }} />
        <div className="absolute inset-x-0 top-0 p-3">
          <p className="truncate text-[15px] font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-[12px] text-white/60">Hub · Home only · hardcoded UI</p>
        </div>
      </button>
      {/* Where this strip's card inserts into the "Your Widgets" ordered
          list on device — empty/blank keeps it pinned last, the default
          before this control existed. See useHomeBrowseHubPosition. */}
      <div
        className="relative z-10 flex items-center gap-2 border-t border-border bg-bg2 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] text-faint">Position</span>
        <input
          type="number"
          min={0}
          value={insertAtIndex ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            onSetInsertAtIndex(raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0));
          }}
          placeholder="Last"
          className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-text outline-none focus:border-accent"
        />
        <span className="text-[10.5px] text-faint">row index, blank = last</span>
      </div>
    </div>
  );
}

function BrowseCard({
  title, tiles, kind, genreFolders, onClick, insertAtIndex, onSetInsertAtIndex,
}: {
  title: string;
  tiles: HomeBrowseTile[];
  kind: 'genre' | 'language';
  genreFolders: Folder[];
  onClick: () => void;
  insertAtIndex: number | null;
  onSetInsertAtIndex: (value: number | null) => void;
}) {
  const shown = tiles.slice(0, 4);
  return (
    <CardShell title={title} onClick={onClick} insertAtIndex={insertAtIndex} onSetInsertAtIndex={onSetInsertAtIndex}>
      <div className="grid grid-cols-2 gap-0.5 bg-border">
        {shown.map((t) => <BrowseTile key={t.id} tile={t} kind={kind} genreFolders={genreFolders} />)}
        {Array.from({ length: Math.max(0, 4 - shown.length) }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-[2/3] w-full bg-surface-2" />
        ))}
      </div>
    </CardShell>
  );
}

function BrowseTile({ tile, kind, genreFolders }: { tile: HomeBrowseTile; kind: 'genre' | 'language'; genreFolders: Folder[] }) {
  const backdrop = useTMDBTileBackdrop(kind, tile.name, tile.iso);
  if (backdrop) {
    return <img src={backdrop} alt="" className="aspect-[2/3] w-full object-cover" />;
  }
  if (kind === 'genre') {
    const folder = findFolderByName(genreFolders, tile.name);
    return folder ? <HubTile folder={folder} /> : <div className="aspect-[2/3] w-full bg-surface-2" />;
  }
  const emoji = (tile.iso && LANGUAGE_FLAG_EMOJI[tile.iso]) || '🌐';
  return (
    <div className="flex aspect-[2/3] w-full items-center justify-center bg-surface-2 text-3xl">{emoji}</div>
  );
}

export function HomeBrowseTilesEditorPanel({ kind, onBack }: { kind: 'genre' | 'language'; onBack: () => void }) {
  const { genres, languages, addTile, deleteTile, reorderTile } = useHomeBrowseTiles();
  const tiles = kind === 'genre' ? genres : languages;
  const genreFolders = useSourceCollectionFolders('Genres');
  const [dragId, setDragId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [iso, setIso] = useState('');

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (kind === 'language') {
      const resolvedIso = iso.trim() || LANGUAGE_ISO_BY_FOLDER_NAME[trimmed.toLowerCase()] || '';
      if (!resolvedIso) { alert('Enter an ISO code for this language (e.g. "ko" for Korean).'); return; }
      await addTile('language', trimmed, resolvedIso);
    } else {
      await addTile('genre', trimmed, null);
    }
    setName('');
    setIso('');
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-accent">
        ← Your Widgets
      </button>
      <h1 className="mb-1 font-display text-2xl font-bold text-text">
        Browse by {kind === 'genre' ? 'Genre' : 'Language'}
      </h1>
      <p className="mb-5 text-[11.5px] text-faint">
        Hub — Home only, hardcoded UI (mirrors MacHomeView's tile strip exactly, including for Premium+'s custom widget builder). Every tile opens the shared {kind === 'genre' ? 'Genre' : 'Language'} Hub screen.
      </p>

      <div className="flex flex-col gap-1.5">
        {tiles.map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={() => setDragId(t.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId && dragId !== t.id) reorderTile(kind, dragId, t.id, 'before'); setDragId(null); }}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5"
          >
            <div className="h-10 w-10 flex-none overflow-hidden rounded-md bg-surface-2">
              <BrowseTile tile={t} kind={kind} genreFolders={genreFolders} />
            </div>
            <span className="flex-1 truncate text-[13.5px] text-text">{t.name}</span>
            {t.iso && <span className="font-mono text-[10.5px] text-faint">{t.iso}</span>}
            <button onClick={() => { if (confirm(`Remove "${t.name}"?`)) deleteTile(t.id); }} className="text-faint hover:text-red-400">×</button>
          </div>
        ))}
        {tiles.length === 0 && <p className="text-sm text-faint">No tiles yet.</p>}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-dashed border-border-strong pt-4">
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'genre' ? 'Genre name, e.g. "Musical"' : 'Language name, e.g. "Vietnamese"'}
          className="flex-1 rounded-lg border border-border bg-bg2 px-3 py-1.5 text-[13px] text-text outline-none focus:border-accent"
        />
        {kind === 'language' && (
          <input
            value={iso} onChange={(e) => setIso(e.target.value)}
            placeholder="iso, e.g. vi"
            className="w-24 rounded-lg border border-border bg-bg2 px-3 py-1.5 font-mono text-[12.5px] text-text outline-none focus:border-accent"
          />
        )}
        <button onClick={handleAdd} className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#160a04] hover:bg-accent-2">
          + Add
        </button>
      </div>
    </div>
  );
}
