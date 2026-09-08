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

interface Props {
  collections: Collection[];
  folders: Folder[];
  activeTab: WidgetTab;
  onSelectCollection: (c: Collection) => void;
  onAddWidget: () => void;
}

export function WidgetGrid({ collections, folders, activeTab, onSelectCollection, onAddWidget }: Props) {
  // Root-level only — a nested collection (parent_collection_id/
  // parent_folder_id set) is structure *inside* its own top-level widget,
  // not a widget of its own, matching Fix 7's "every root-level collections
  // row is the widget; nested folders/sources have no tabs/status of their
  // own" model.
  const roots = collections
    .filter((c) => !c.parent_collection_id && !c.parent_folder_id)
    .filter((c) => isOnWidgetTab(c, activeTab))
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
        {roots.map((c) => (
          <WidgetCard key={c.id} collection={c} folderCount={folders.filter((f) => f.collection_id === c.id && !f.parent_folder_id).length} onClick={() => onSelectCollection(c)} />
        ))}
        <button
          onClick={onAddWidget}
          className="flex min-h-[178px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <span className="text-2xl leading-none">+</span>
          <span>Add Widget</span>
        </button>
      </div>

      {roots.length === 0 && (
        <p className="mt-2 text-sm text-faint">
          No widgets assigned to {activeTab[0].toUpperCase() + activeTab.slice(1)} yet — add one, or edit an existing widget's Tab visibility in its Collection settings.
        </p>
      )}
    </div>
  );
}

function WidgetCard({ collection, folderCount, onClick }: { collection: Collection; folderCount: number; onClick: () => void }) {
  const subtitle = collection.display_section === 'hub' ? 'Hub' : collection.display_section === 'rows' ? 'Rows' : `${folderCount} folder${folderCount === 1 ? '' : 's'}`;
  return (
    <button
      onClick={onClick}
      className="group relative h-[178px] overflow-hidden rounded-2xl border border-border bg-bg2 text-left transition-all hover:-translate-y-1 hover:border-accent"
    >
      {collection.backdrop_image ? (
        <img src={collection.backdrop_image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-surface-2" />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(13,6,4,.85),rgba(13,6,4,.15) 55%)' }} />
      {collection.status === 'draft' && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-fuchsia-500/85 px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-[#1a0512]">
          Draft
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="truncate text-[14px] font-semibold text-white">{collection.name}</p>
        <p className="mt-0.5 text-[11px] text-white/65">{subtitle}</p>
      </div>
    </button>
  );
}
