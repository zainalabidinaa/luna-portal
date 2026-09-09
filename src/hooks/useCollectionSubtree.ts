import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Collection, Folder, FolderSource, FolderCatalog } from '../types';

/**
 * Everything needed to render and edit ONE widget's own hierarchy — the
 * collection itself, every folder in its subtree (flat, walked in-memory by
 * parent_folder_id), and each folder's attached sources/catalogs.
 *
 * Deliberately separate from CatalogPage.tsx's own state rather than a
 * shared refactor of it: CatalogPage owns a much bigger concern (the whole
 * sidebar tree across every collection, cross-collection nesting, JSON
 * import/export) that this hook has no reason to touch. Some CRUD shape
 * inevitably mirrors CatalogPage's own (add/delete folder, add/delete
 * source/catalog, save collection settings) since it's the same underlying
 * tables — kept deliberately parallel rather than unified so a change to
 * CatalogPage's still-working sidebar flow can't accidentally regress this
 * screen, and vice versa.
 */
export function useCollectionSubtree(collectionId: string | null) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sourcesByFolder, setSourcesByFolder] = useState<Record<string, FolderSource[]>>({});
  const [catalogsByFolder, setCatalogsByFolder] = useState<Record<string, FolderCatalog[]>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!collectionId) { setCollection(null); setFolders([]); setSourcesByFolder({}); setCatalogsByFolder({}); setLoading(false); return; }
    setLoading(true);
    const [{ data: colRow }, { data: folderRows }] = await Promise.all([
      supabase.from('collections').select('*').eq('id', collectionId).single(),
      supabase.from('folders').select('*').eq('collection_id', collectionId).order('sort_order'),
    ]);
    setCollection((colRow as Collection) ?? null);
    const fRows = (folderRows ?? []) as Folder[];
    setFolders(fRows);

    const folderIds = fRows.map((f) => f.id);
    if (folderIds.length) {
      const [{ data: srcRows }, { data: catRows }] = await Promise.all([
        supabase.from('folder_sources').select('*').in('folder_id', folderIds).order('sort_order'),
        supabase.from('folder_catalogs').select('*').in('folder_id', folderIds),
      ]);
      const sBy: Record<string, FolderSource[]> = {};
      for (const s of (srcRows ?? []) as FolderSource[]) (sBy[s.folder_id] ??= []).push(s);
      const cBy: Record<string, FolderCatalog[]> = {};
      for (const c of (catRows ?? []) as FolderCatalog[]) (cBy[c.folder_id] ??= []).push(c);
      setSourcesByFolder(sBy);
      setCatalogsByFolder(cBy);
    } else {
      setSourcesByFolder({});
      setCatalogsByFolder({});
    }
    setLoading(false);
  }, [collectionId]);

  useEffect(() => {
    refresh();
    if (!collectionId) return;

    // Real-time: this widget's own subtree only — CatalogPage's own
    // collections-changes/folders-changes subscriptions are unrelated and
    // stay scoped to its own sidebar-wide concern.
    const sub = supabase
      .channel(`widget-subtree-${collectionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collections', filter: `id=eq.${collectionId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folders', filter: `collection_id=eq.${collectionId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [collectionId, refresh]);

  async function saveCollectionSettings(patch: Partial<Collection>) {
    if (!collectionId) return;
    const { error } = await supabase.from('collections').update(patch).eq('id', collectionId);
    if (error) throw new Error(error.message);
    setCollection((c) => (c ? { ...c, ...patch } : c));
  }

  async function addFolder(name: string, parentFolderId: string | null) {
    if (!collectionId) return null;
    const siblingCount = folders.filter((f) => f.parent_folder_id === parentFolderId).length;
    const { data, error } = await supabase.from('folders').insert({
      collection_id: collectionId, name, parent_folder_id: parentFolderId,
      sort_order: siblingCount, tile_shape: 'poster', enabled: true,
    }).select().single();
    if (error) { console.error('Failed to add folder:', error); return null; }
    const row = data as Folder;
    setFolders((p) => [...p, row]);
    return row;
  }

  async function deleteFolder(id: string) {
    await supabase.from('folder_catalogs').delete().eq('folder_id', id);
    await supabase.from('folder_sources').delete().eq('folder_id', id);
    await supabase.from('folders').delete().eq('id', id);
    setFolders((p) => p.filter((f) => f.id !== id));
    setSourcesByFolder((p) => { const n = { ...p }; delete n[id]; return n; });
    setCatalogsByFolder((p) => { const n = { ...p }; delete n[id]; return n; });
  }

  // Reorders siblings sharing the same parent folder (or root, when
  // parentFolderId is null) — mirrors CatalogPage.tsx's reorderFolderSiblings
  // but scoped to one fixed collection, so no parentKey string-parsing needed.
  async function reorderFolderSiblings(draggedId: string, targetId: string, zone: 'before' | 'after', parentFolderId: string | null) {
    const dragged = folders.find((f) => f.id === draggedId);
    const target = folders.find((f) => f.id === targetId);
    if (!dragged || !target) return;

    const siblings = folders
      .filter((f) => f.id !== draggedId && f.parent_folder_id === parentFolderId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const targetIdx = siblings.findIndex((f) => f.id === targetId);
    if (targetIdx === -1) return;
    const insertAt = zone === 'before' ? targetIdx : targetIdx + 1;
    siblings.splice(insertAt, 0, { ...dragged, parent_folder_id: parentFolderId });

    setFolders((prev) => {
      const byId = new Map(siblings.map((f, i) => [f.id, i]));
      return prev.map((f) => (byId.has(f.id) ? { ...f, sort_order: byId.get(f.id)!, parent_folder_id: parentFolderId } : f));
    });
    await Promise.all(siblings.map((f, i) =>
      supabase.from('folders').update({ sort_order: i, parent_folder_id: parentFolderId }).eq('id', f.id)
    ));
  }

  async function saveFolderArtwork(folderId: string, patch: Partial<Folder>) {
    await supabase.from('folders').update(patch).eq('id', folderId);
    setFolders((p) => p.map((f) => (f.id === folderId ? { ...f, ...patch } : f)));
  }

  async function addSource(folderId: string, provider: string) {
    const count = sourcesByFolder[folderId]?.length ?? 0;
    const { data, error } = await supabase.from('folder_sources').insert({
      folder_id: folderId, provider, sort_order: count,
    }).select().single();
    if (error) { console.error('Failed to add source:', error); return; }
    setSourcesByFolder((p) => ({ ...p, [folderId]: [...(p[folderId] ?? []), data as FolderSource] }));
  }

  async function deleteSource(folderId: string, id: string) {
    await supabase.from('folder_sources').delete().eq('id', id);
    setSourcesByFolder((p) => ({ ...p, [folderId]: (p[folderId] ?? []).filter((s) => s.id !== id) }));
  }

  async function addCatalog(folderId: string, catalogId: string, mediaType: string, genre: string | null, addonId: string | null = null) {
    const { data, error } = await supabase.from('folder_catalogs').insert({
      folder_id: folderId, catalog_id: catalogId, media_type: mediaType, genre: genre ?? null, addon_id: addonId,
    }).select().single();
    if (error) { console.error('Failed to add catalog:', error); return; }
    setCatalogsByFolder((p) => ({ ...p, [folderId]: [...(p[folderId] ?? []), data as FolderCatalog] }));
  }

  async function deleteCatalog(folderId: string, id: string) {
    await supabase.from('folder_catalogs').delete().eq('id', id);
    setCatalogsByFolder((p) => ({ ...p, [folderId]: (p[folderId] ?? []).filter((c) => c.id !== id) }));
  }

  // One-time deep copy of another collection's folder (and its whole
  // subtree, catalogs, and sources) into this widget as a new, fully
  // independent set of rows — importing never links back to or mutates the
  // source collection, matching "widgets are their own thing, seeded from a
  // collection but independent after that."
  async function importFolder(sourceFolderId: string, targetParentFolderId: string | null) {
    if (!collectionId) return;

    const { data: rootRow } = await supabase.from('folders').select('*').eq('id', sourceFolderId).single();
    if (!rootRow) return;
    const root = rootRow as Folder;

    const descendants: Folder[] = [];
    let frontier = [sourceFolderId];
    while (frontier.length) {
      const { data } = await supabase.from('folders').select('*').in('parent_folder_id', frontier);
      const rows = (data ?? []) as Folder[];
      descendants.push(...rows);
      frontier = rows.map((r) => r.id);
    }
    const allSource = [root, ...descendants];
    const sourceIds = allSource.map((f) => f.id);
    const [{ data: srcCats }, { data: srcSrcs }] = await Promise.all([
      supabase.from('folder_catalogs').select('*').in('folder_id', sourceIds),
      supabase.from('folder_sources').select('*').in('folder_id', sourceIds),
    ]);

    const idMap = new Map<string, string>();
    const siblingCount = folders.filter((f) => f.parent_folder_id === targetParentFolderId).length;
    const newFolders: Folder[] = [];

    async function insertCopy(f: Folder, parentFolderId: string | null, sortOrder: number): Promise<Folder | null> {
      const { data, error } = await supabase.from('folders').insert({
        collection_id: collectionId, name: f.name, parent_folder_id: parentFolderId,
        sort_order: sortOrder, tile_shape: f.tile_shape, enabled: true,
        cover_image: f.cover_image, hero_backdrop: f.hero_backdrop, title_logo: f.title_logo,
        hero_video_url: f.hero_video_url, hide_title: f.hide_title,
        focus_gif: f.focus_gif, focus_gif_enabled: f.focus_gif_enabled,
      }).select().single();
      if (error) { console.error('Failed to import folder:', error); return null; }
      return data as Folder;
    }

    const rootCopy = await insertCopy(root, targetParentFolderId, siblingCount);
    if (!rootCopy) return;
    idMap.set(root.id, rootCopy.id);
    newFolders.push(rootCopy);

    let remaining = descendants;
    while (remaining.length) {
      const ready = remaining.filter((f) => f.parent_folder_id && idMap.has(f.parent_folder_id));
      if (ready.length === 0) break; // orphaned rows (shouldn't happen) — stop rather than loop forever
      for (const f of ready) {
        const copy = await insertCopy(f, idMap.get(f.parent_folder_id!)!, f.sort_order);
        if (copy) { idMap.set(f.id, copy.id); newFolders.push(copy); }
      }
      remaining = remaining.filter((f) => !idMap.has(f.id));
    }

    const catalogInserts = (srcCats ?? [])
      .filter((c) => idMap.has(c.folder_id))
      .map((c) => ({ folder_id: idMap.get(c.folder_id)!, catalog_id: c.catalog_id, media_type: c.media_type, genre: c.genre, addon_id: c.addon_id }));
    const sourceInserts = (srcSrcs ?? [])
      .filter((s) => idMap.has(s.folder_id))
      .map((s) => ({ folder_id: idMap.get(s.folder_id)!, provider: s.provider, title: s.title, tmdb_id: s.tmdb_id, media_type: s.media_type, sort_order: s.sort_order }));
    if (catalogInserts.length) await supabase.from('folder_catalogs').insert(catalogInserts);
    if (sourceInserts.length) await supabase.from('folder_sources').insert(sourceInserts);

    setFolders((p) => [...p, ...newFolders]);
    await refresh();
  }

  return {
    collection, folders, sourcesByFolder, catalogsByFolder, loading, refresh,
    saveCollectionSettings, addFolder, deleteFolder, reorderFolderSiblings, saveFolderArtwork,
    addSource, deleteSource, addCatalog, deleteCatalog, importFolder,
  };
}
