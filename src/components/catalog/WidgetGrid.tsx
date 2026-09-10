import { useState } from 'react';
import { useFolderPreviewPosters, useFolderTileImage } from '../../hooks/useFolderPreviewPosters';
import { FallbackPosterImg } from './FallbackPosterImg';
import type { Collection, Folder } from '../../types';

export type WidgetTab = 'home' | 'movies' | 'series';
export const TAB_FLAG: Record<WidgetTab, { ios: keyof Collection; mac: keyof Collection }> = {
  home: { ios: 'show_ios_home', mac: 'show_mac_home' },
  movies: { ios: 'show_ios_movies', mac: 'show_mac_movies' },
  series: { ios: 'show_ios_series', mac: 'show_mac_series' },
};

/** A root-level collection belongs to `tab` if either platform shows it
 *  there — the portal authors content once, not per-platform, so a curator
 *  deciding "does this belong on Movies" shouldn't have to think about iOS
 *  vs Mac separately. */
export function isOnWidgetTab(c: Collection, tab: WidgetTab): boolean {
  const { ios, mac } = TAB_FLAG[tab];
  return Boolean(c[ios]) || Boolean(c[mac]);
}

/** One card's worth of identity. In "all" mode `key === collection.id`. In
 *  "preset" mode `key` is the owning `home_preset_items.id` instead — the
 *  same collection can legitimately appear more than once across tabs/
 *  presets (e.g. a widget shown on both Home and Movies), so the card's
 *  identity for delete/reorder purposes must be the *item*, not the
 *  collection, or those two appearances would be indistinguishable.
 *
 *  `browseHub` cards ("Browse by Genre"/"Browse by Language") are
 *  preset-only (mode 'preset', Home tab) — they aren't collections
 *  themselves, but a real ordered `home_preset_items` row
 *  (`data_source: {kind:'browseHub', hub:'genre'|'language'}`) controlling
 *  only where the strip sits among other widgets. Clicking one opens the
 *  real "Genres"/"Languages" collection instead (see `onOpenBrowseHub`) —
 *  that's where its actual content (one real folder per genre/language,
 *  each with its own sources) lives, same as any other widget. */
export type WidgetCardItem =
  | {
      key: string;
      kind: 'collection';
      collection: Collection;
      /** The preset item's own render style (only meaningful in "preset"
       *  mode — style is a property of a widget's *placement*, not of the
       *  collection itself, so "all widgets" mode has no style to show). */
      style?: string;
    }
  | { key: string; kind: 'browseHub'; hub: 'genre' | 'language' };

const STYLE_LABELS: Record<string, string> = {
  standard: 'Row Classic',
  heroBanner: 'Hero',
  cardStack: 'Card Stack',
  carouselCinematic: 'Carousel',
  topTen: 'Row Numbered',
};

interface Props {
  items: WidgetCardItem[];
  folders: Folder[];
  activeTab: WidgetTab;
  mode: 'all' | 'preset';
  onSelectCollection: (c: Collection) => void;
  /** Opens the real "Genres"/"Languages" collection in `WidgetEditor` for a
   *  `browseHub` card — its own position in this grid is just
   *  drag-and-drop like everything else; this is only for editing its
   *  actual content (folders/sources/artwork). */
  onOpenBrowseHub: (hub: 'genre' | 'language') => void;
  onAddWidget: () => void;
  onDeleteCard: (item: WidgetCardItem) => void;
  onReorderCard: (draggedKey: string, targetKey: string, zone: 'before' | 'after') => void;
}

export function WidgetGrid({ items, folders, activeTab, mode, onSelectCollection, onOpenBrowseHub, onAddWidget, onDeleteCard, onReorderCard }: Props) {
  const [dragKey, setDragKey] = useState<string | null>(null);

  return (
    <div>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
        {items.map((item, index) => (
          <WidgetCard
            key={item.key}
            item={item}
            childFolders={item.kind === 'collection' ? folders.filter((f) => f.collection_id === item.collection.id && !f.parent_folder_id) : []}
            mode={mode}
            isHomeTab={activeTab === 'home'}
            onClick={item.kind === 'collection' ? () => onSelectCollection(item.collection) : () => onOpenBrowseHub(item.hub)}
            onDelete={() => onDeleteCard(item)}
            onDragStart={() => setDragKey(item.key)}
            onDrop={() => { if (dragKey && dragKey !== item.key) onReorderCard(dragKey, item.key, 'before'); setDragKey(null); }}
            // Explicit buttons alongside drag-and-drop — dragging a card
            // precisely into a many-item grid is fiddly, especially on a
            // trackpad; a plain click to nudge one slot at a time is a lot
            // more reliable for "move this one thing up/down".
            onMoveUp={index > 0 ? () => onReorderCard(item.key, items[index - 1].key, 'before') : undefined}
            onMoveDown={index < items.length - 1 ? () => onReorderCard(item.key, items[index + 1].key, 'after') : undefined}
          />
        ))}
        <button
          onClick={onAddWidget}
          className="flex min-h-[178px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <span className="text-2xl leading-none">+</span>
          <span>Add Widget</span>
        </button>
      </div>

      {items.length === 0 && (
        <p className="mt-2 text-sm text-faint">
          {mode === 'preset'
            ? `No widgets in this preset's ${activeTab[0].toUpperCase() + activeTab.slice(1)} list yet — add one below.`
            : `No widgets assigned to ${activeTab[0].toUpperCase() + activeTab.slice(1)} yet — add one, or edit an existing widget's Tab visibility in its Collection settings.`}
        </p>
      )}
    </div>
  );
}

const BROWSE_HUB_LABELS: Record<'genre' | 'language', string> = {
  genre: 'Browse by Genre',
  language: 'Browse by Language',
};

function WidgetCard({
  item, childFolders, mode, isHomeTab, onClick, onDelete, onDragStart, onDrop, onMoveUp, onMoveDown,
}: {
  item: WidgetCardItem;
  childFolders: Folder[];
  mode: 'all' | 'preset';
  isHomeTab: boolean;
  onClick?: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  if (item.kind === 'browseHub') {
    return (
      <BrowseHubCard
        hub={item.hub}
        onClick={onClick}
        onDelete={onDelete}
        onDragStart={onDragStart}
        onDrop={onDrop}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    );
  }

  const { collection } = item;
  const folderCount = childFolders.length;
  // In "preset" mode the item's own placement style is the more useful
  // label (it's what the real on-device "Your Widgets" screen shows —
  // Row Classic / Hero / Card Stack / Row Numbered). "All widgets" mode has
  // no style (it's not a property of the collection itself), so it falls
  // back to the structural description instead.
  //
  // "Hardcoded UI" is only true of Home's genre/language tile strip
  // (MacHomeView's homeGenres/homeLanguages, a one-off SwiftUI view with no
  // tie to `collections` at all). A Movies/Series widget with
  // display_section === 'hub' renders through the same generic
  // CatalogRepository.displayRows group-tile path as everything else, so it
  // gets the plain folder-count label instead of the misleading one.
  const subtitle = item.style
    ? STYLE_LABELS[item.style] ?? item.style
    : collection.display_section === 'hub' ? (isHomeTab ? 'Hub · hardcoded UI' : `Hub · ${folderCount} folders`)
    : collection.display_section === 'rows' ? 'Rows'
    : folderCount >= 2 ? `Hub · ${folderCount} folders`
    : folderCount === 1 ? 'Folder · content row' : 'Empty';

  const isFolderWidget = folderCount >= 2;
  // A standard/content-row widget has one folder holding real catalog
  // sources — its own cover_image/hero_backdrop is admin metadata, not
  // representative of the many titles inside, so real poster art is fetched
  // from that folder's actual source instead (see useFolderPreviewPosters).
  const sourcePosters = useFolderPreviewPosters(!isFolderWidget ? childFolders[0]?.id ?? null : null);
  const hubTiles = isFolderWidget ? childFolders.slice(0, 4) : [];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="group relative overflow-hidden rounded-2xl border border-border bg-bg2 transition-all hover:-translate-y-1 hover:border-accent"
    >
      <button onClick={onClick} className="relative block w-full text-left">
        {isFolderWidget ? (
          <div className="grid grid-cols-2 gap-0.5 bg-border">
            {hubTiles.map((f) => (
              <HubTile key={f.id} folder={f} />
            ))}
            {Array.from({ length: Math.max(0, 4 - hubTiles.length) }).map((_, i) => (
              <div key={`pad-${i}`} className={`${tileAspectClass(hubTiles[0]?.tile_shape)} w-full bg-surface-2`} />
            ))}
          </div>
        ) : sourcePosters.length > 0 ? (
          <div className="grid grid-cols-2 gap-0.5 bg-border">
            {[0, 1, 2, 3].map((i) => (
              <FallbackPosterImg key={i} pool={sourcePosters} slot={i} totalSlots={4} className="aspect-[2/3] w-full object-cover" />
            ))}
          </div>
        ) : collection.backdrop_image ? (
          <img src={collection.backdrop_image} alt="" className="aspect-square w-full object-cover" />
        ) : (
          <div className="aspect-square w-full bg-surface-2" />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(13,6,4,.8) 0%,rgba(13,6,4,.35) 32%,transparent 60%)' }} />
        {collection.status === 'draft' && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-fuchsia-500/85 px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-[#1a0512]">
            Draft
          </span>
        )}
        <div className="absolute inset-x-0 top-0 p-3">
          <p className="truncate text-[15px] font-semibold text-white">{collection.name}</p>
          <p className="mt-0.5 text-[12px] text-white/60">{subtitle}</p>
        </div>
      </button>
      <div className="absolute bottom-2.5 left-2.5 z-[2] flex gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
          disabled={!onMoveUp}
          title="Move earlier"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ↑
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
          disabled={!onMoveDown}
          title="Move later"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ↓
        </button>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          const msg = mode === 'preset'
            ? `Remove "${collection.name}" from this preset's list? The widget itself is untouched.`
            : `Delete the "${collection.name}" widget entirely? This removes it everywhere, including from any preset that references it.`;
          if (confirm(msg)) onDelete();
        }}
        title={mode === 'preset' ? 'Remove from this preset' : 'Delete widget'}
        className="absolute bottom-2.5 right-2.5 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
      >
        🗑
      </button>
    </div>
  );
}

// "Browse by Genre"/"Browse by Language" are a hardcoded SwiftUI tile strip
// on-device (MacHomeView's homeGenres/homeLanguages), not a real collection —
// this card exists purely so admins can drag/reorder them alongside other
// Home widgets; there's nothing to click through to.
function BrowseHubCard({
  hub, onClick, onDelete, onDragStart, onDrop, onMoveUp, onMoveDown,
}: {
  hub: 'genre' | 'language';
  onClick?: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border border-border bg-bg2 p-3 transition-all hover:-translate-y-1 hover:border-accent"
    >
      <button onClick={onClick} className="block w-full text-left" title="Edit tile names">
        <p className="truncate text-[15px] font-semibold text-white">{BROWSE_HUB_LABELS[hub]}</p>
        <p className="mt-0.5 text-[12px] text-white/60">Hub · hardcoded UI</p>
      </button>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
            disabled={!onMoveUp}
            title="Move earlier"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↑
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
            disabled={!onMoveDown}
            title="Move later"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↓
          </button>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Remove "${BROWSE_HUB_LABELS[hub]}" from this preset's Home list?`)) onDelete();
          }}
          title="Remove from this preset"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

// Lowercase — must match `PosterShape`'s raw values in MoonlitCore
// (Models/MetaModels.swift), which the on-device apps decode case-
// sensitively. A mismatched case (e.g. legacy 'POSTER' rows) silently falls
// back to `.landscape` there, so every writer of `tile_shape` in this portal
// must use these exact strings.
export const TILE_SHAPES = ['poster', 'landscape', 'square'] as const;

export function tileAspectClass(shape: string | null | undefined): string {
  switch (shape) {
    case 'landscape': return 'aspect-video';
    case 'square': return 'aspect-square';
    default: return 'aspect-[2/3]';
  }
}

// A hub's own child-folder tile — Genre Hub's folders already carry curated
// icon art (cover_image/hero_backdrop), used as-is. Language Hub's folders
// have neither their own image nor their own catalogs (the real sources
// live one level down, e.g. "Korean" > "Popular Korean Movies"), so
// useFolderTileImage falls back to that child automatically.
export function HubTile({ folder }: { folder: Folder }) {
  const image = useFolderTileImage(folder);
  const aspect = tileAspectClass(folder.tile_shape);
  return image ? (
    <img src={image} alt="" className={`${aspect} w-full object-cover`} />
  ) : (
    <div className={`${aspect} w-full bg-surface-2`} />
  );
}
