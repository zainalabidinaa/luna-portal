import { supabase } from './supabase';
import type { Collection, Folder } from '../types';
import type { WidgetTab } from '../components/catalog/WidgetGrid';
import { TAB_FLAG } from '../components/catalog/WidgetGrid';

/**
 * Deep-copies a widget (its `collections` row, and every `folders`/
 * `folder_sources`/`folder_catalogs` row in its subtree) into a brand-new,
 * fully independent set of rows — mirrors useCollectionSubtree.ts's own
 * `importFolder`, one level up. Used whenever a widget already used on one
 * tab gets "added" to another: without this, both tabs would point at the
 * same `collections.id` and editing one would edit both.
 *
 * The clone starts visible only on `targetTab` (or on no tab at all, when
 * the caller only needs it referenced by a preset's `home_preset_items`
 * row) — it never inherits the source's own tab-visibility flags, since
 * those describe the source widget's placement, not the copy's.
 */
export async function cloneCollection(sourceCollectionId: string, targetTab: WidgetTab | null): Promise<Collection | null> {
  const { data: sourceRow } = await supabase.from('collections').select('*').eq('id', sourceCollectionId).single();
  if (!sourceRow) return null;
  const source = sourceRow as Collection;

  const { count } = await supabase.from('collections').select('*', { count: 'exact', head: true });
  const visibility = targetTab
    ? { [TAB_FLAG[targetTab].ios]: true, [TAB_FLAG[targetTab].mac]: true }
    : {};

  const { data: newRow, error } = await supabase.from('collections').insert({
    name: source.name, view_mode: source.view_mode, sort_order: count ?? 0,
    backdrop_image: source.backdrop_image, show_all_tab: source.show_all_tab,
    focus_glow_enabled: source.focus_glow_enabled, pin_to_top: source.pin_to_top,
    enabled: source.enabled, status: source.status, display_section: source.display_section,
    show_on_home: false, show_ios_home: false, show_ios_movies: false, show_ios_series: false,
    show_mac_home: false, show_mac_movies: false, show_mac_series: false,
    parent_collection_id: null, parent_folder_id: null, owner_profile_id: null,
    ...visibility,
  }).select().single();
  if (error || !newRow) { console.error('Failed to clone collection:', error); return null; }
  const clone = newRow as Collection;

  const { data: rootFolderRows } = await supabase.from('folders').select('*').eq('collection_id', sourceCollectionId).is('parent_folder_id', null).order('sort_order');
  const rootFolders = (rootFolderRows ?? []) as Folder[];
  if (rootFolders.length === 0) return clone;

  const descendants: Folder[] = [];
  let frontier = rootFolders.map((f) => f.id);
  while (frontier.length) {
    const { data } = await supabase.from('folders').select('*').in('parent_folder_id', frontier);
    const rows = (data ?? []) as Folder[];
    descendants.push(...rows);
    frontier = rows.map((r) => r.id);
  }
  const allSource = [...rootFolders, ...descendants];
  const sourceIds = allSource.map((f) => f.id);
  const [{ data: srcCats }, { data: srcSrcs }] = await Promise.all([
    supabase.from('folder_catalogs').select('*').in('folder_id', sourceIds),
    supabase.from('folder_sources').select('*').in('folder_id', sourceIds),
  ]);

  const idMap = new Map<string, string>();
  async function insertCopy(f: Folder, parentFolderId: string | null): Promise<Folder | null> {
    const { data, error: err } = await supabase.from('folders').insert({
      collection_id: clone.id, name: f.name, parent_folder_id: parentFolderId,
      sort_order: f.sort_order, tile_shape: f.tile_shape, enabled: f.enabled,
      cover_image: f.cover_image, hero_backdrop: f.hero_backdrop, title_logo: f.title_logo,
      hero_video_url: f.hero_video_url, hide_title: f.hide_title,
      focus_gif: f.focus_gif, focus_gif_enabled: f.focus_gif_enabled,
    }).select().single();
    if (err) { console.error('Failed to clone folder:', err); return null; }
    return data as Folder;
  }

  for (const f of rootFolders) {
    const copy = await insertCopy(f, null);
    if (copy) idMap.set(f.id, copy.id);
  }
  let remaining = descendants;
  while (remaining.length) {
    const ready = remaining.filter((f) => f.parent_folder_id && idMap.has(f.parent_folder_id));
    if (ready.length === 0) break; // orphaned rows (shouldn't happen) — stop rather than loop forever
    for (const f of ready) {
      const copy = await insertCopy(f, idMap.get(f.parent_folder_id!)!);
      if (copy) idMap.set(f.id, copy.id);
    }
    remaining = remaining.filter((f) => !idMap.has(f.id));
  }

  const catalogInserts = (srcCats ?? [])
    .filter((c) => idMap.has(c.folder_id))
    .map((c) => ({ folder_id: idMap.get(c.folder_id)!, catalog_id: c.catalog_id, media_type: c.media_type, genre: c.genre, addon_id: c.addon_id, filter_params: c.filter_params }));
  const sourceInserts = (srcSrcs ?? [])
    .filter((s) => idMap.has(s.folder_id))
    .map((s) => ({ folder_id: idMap.get(s.folder_id)!, provider: s.provider, title: s.title, tmdb_id: s.tmdb_id, media_type: s.media_type, sort_order: s.sort_order }));
  if (catalogInserts.length) await supabase.from('folder_catalogs').insert(catalogInserts);
  if (sourceInserts.length) await supabase.from('folder_sources').insert(sourceInserts);

  return clone;
}
