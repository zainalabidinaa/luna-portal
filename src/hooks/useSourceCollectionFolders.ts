import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Folder } from '../types';

// Cached — these barely change and multiple tiles look up the same source
// collection's folders within one page load.
const cache = new Map<string, Promise<Folder[]>>();

function loadFolders(collectionName: string): Promise<Folder[]> {
  let promise = cache.get(collectionName);
  if (!promise) {
    promise = (async () => {
      // %-wrapped: some collection names carry an invisible LRM/RLM prefix
      // character (a leftover from RTL-locale authoring), which breaks an
      // exact ilike match even though the visible name looks identical.
      const { data: cols } = await supabase.from('collections').select('id').ilike('name', `%${collectionName}%`).limit(1);
      const collectionId = cols?.[0]?.id;
      if (!collectionId) return [];
      const { data: folders } = await supabase.from('folders').select('*').eq('collection_id', collectionId).is('parent_folder_id', null);
      return (folders as Folder[]) ?? [];
    })();
    cache.set(collectionName, promise);
  }
  return promise;
}

/** Root folders of a named source collection ("Genres", "Languages") —
 *  used to find each Home browse tile's matching folder for its real
 *  artwork, since a browse tile (see useHomeBrowseTiles) is just a name,
 *  not a folder of its own. */
export function useSourceCollectionFolders(collectionName: string): Folder[] {
  const [folders, setFolders] = useState<Folder[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadFolders(collectionName).then((result) => {
      if (!cancelled) setFolders(result);
    });
    return () => { cancelled = true; };
  }, [collectionName]);
  return folders;
}

export function findFolderByName(folders: Folder[], name: string): Folder | undefined {
  const target = name.trim().toLowerCase();
  return folders.find((f) => f.name.trim().toLowerCase() === target);
}
