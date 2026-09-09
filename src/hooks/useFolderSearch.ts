import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Folder } from '../types';

export interface FolderSearchResult {
  folder: Folder;
  collectionName: string;
  childCount: number;
  /** True when the folder's own collection is published to at least one tab
   *  (any show_ios_ or show_mac_ flag) — i.e. it's an actual "Widget" today,
   *  not just a row sitting in the Collections staging page. */
  isWidget: boolean;
}

/** Every folder across every collection, with its owning collection's name,
 *  its own child count, and whether that collection counts as a "Widget"
 *  (published to a tab) vs. just a Collections-page row — powers the
 *  "import folder from a widget / from a collection" picker in
 *  WidgetEditor. Loaded once per page session; the admin searches
 *  client-side rather than round-tripping per keystroke. */
export function useFolderSearch() {
  const [results, setResults] = useState<FolderSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: cols }, { data: folders }] = await Promise.all([
        supabase.from('collections').select('id,name,show_ios_home,show_ios_movies,show_ios_series,show_mac_home,show_mac_movies,show_mac_series'),
        supabase.from('folders').select('*').order('name'),
      ]);
      if (cancelled) return;
      type ColRow = {
        id: string; name: string;
        show_ios_home: boolean | null; show_ios_movies: boolean | null; show_ios_series: boolean | null;
        show_mac_home: boolean | null; show_mac_movies: boolean | null; show_mac_series: boolean | null;
      };
      const colById = new Map((cols ?? []).map((c: ColRow) => [c.id, c]));
      const allFolders = (folders ?? []) as Folder[];
      const childCountByParent = new Map<string, number>();
      for (const f of allFolders) {
        if (f.parent_folder_id) childCountByParent.set(f.parent_folder_id, (childCountByParent.get(f.parent_folder_id) ?? 0) + 1);
      }
      setResults(allFolders.map((folder) => {
        const col = colById.get(folder.collection_id);
        const isWidget = Boolean(col && (col.show_ios_home || col.show_ios_movies || col.show_ios_series || col.show_mac_home || col.show_mac_movies || col.show_mac_series));
        return {
          folder,
          collectionName: col?.name ?? 'Unknown',
          childCount: childCountByParent.get(folder.id) ?? 0,
          isWidget,
        };
      }));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { results, loading };
}
