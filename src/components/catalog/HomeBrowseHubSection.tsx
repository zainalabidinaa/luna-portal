import { useState } from 'react';
import { useHomeBrowseTiles, type HomeBrowseTile } from '../../hooks/useHomeBrowseTiles';
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
 * collections used elsewhere in the portal. Their card in the "Your
 * Widgets" grid (`WidgetGrid.BrowseHubCard`) opens `HomeBrowseTilesEditorPanel`
 * below to edit the tile names themselves; their position among other
 * widgets is just `home_preset_items.sort_order`, the same drag-and-drop
 * ordering every other card already has — no separate position control.
 *
 * Tile art is a real TMDB backdrop, fetched with the exact same discover
 * query TMDBTileBackdropFetcher.swift uses for MacGenreTile/MacLanguageTile
 * (see useTMDBTileBackdrop) — this is a single full image per tile, not the
 * on-device sheared 3-image band + gradient + endonym watermark, which is a
 * separate design/CSS effort. Falls back to the Genres collection's curated
 * icon (genre) or a flag emoji (language) if TMDB has nothing.
 */
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
