import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { FolderGrid } from '../../components/catalog/FolderGrid';
import { CollectionTree } from '../../components/catalog/CollectionTree';
import { ArtworkGallery } from '../../components/catalog/ArtworkGallery';
import { SourcesTable } from '../../components/catalog/SourcesTable';
import { JsonImport } from '../../components/catalog/JsonImport';
import { CollectionSettings } from '../../components/catalog/CollectionSettings';
import { useAutoScrollOnDrag } from '../../hooks/useAutoScrollOnDrag';
import type { Collection, Folder, FolderSource, FolderCatalog, InstalledAddon } from '../../types';

type Tab = 'folders' | 'artwork' | 'sources' | 'json' | 'collection';
const TABS: { id: Tab; label: string }[] = [
  { id: 'collection', label: 'Collection' },
  { id: 'folders', label: 'Folders' },
  { id: 'artwork', label: 'Folder artwork' },
  { id: 'sources', label: 'Sources' },
  { id: 'json', label: 'JSON' },
];

export default function CatalogPage() {
  useAutoScrollOnDrag();
  const { activeProfile } = useAuth();
  // Deep-link from the Widgets page's "Your Widgets" grid (Fix 8): jump
  // straight to a specific collection's Collection-settings tab instead of
  // whichever one `loadCollections` would otherwise default to.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkedId = searchParams.get('collection');
  const [installedAddons, setInstalledAddons] = useState<InstalledAddon[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  // Every folder across every collection, for the sidebar tree — separate
  // from `folders` below, which stays scoped to just the selected
  // collection for the Folders/artwork/sources tabs.
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkedId);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [sources, setSources] = useState<FolderSource[]>([]);
  const [catalogs, setCatalogs] = useState<FolderCatalog[]>([]);
  const [tab, setTab] = useState<Tab>(deepLinkedId ? 'collection' : 'folders');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const folderDrag = useRef<number | null>(null);

  useEffect(() => {
    // Consume the deep link once — otherwise a later sidebar click followed
    // by a refresh would snap back to this collection instead of whichever
    // one was actually selected.
    if (deepLinkedId) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCollections();

    // Real-time: re-fetch when collections or folders change in Supabase.
    // Folders are unfiltered here (not just the selected collection) because
    // the sidebar tree now shows every collection's folders inline.
    const colSub = supabase
      .channel('collections-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collections' }, () => loadCollections())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folders' }, () => loadCollections())
      .subscribe();

    return () => { supabase.removeChannel(colSub); };
  }, []);

  // The admin's own installed addons, so the Sources tab can browse/search
  // any of them (not just the hardcoded AIOMetadata manifest) and correctly
  // attribute a catalog source to the addon it actually came from — without
  // this, every source shows "Unknown addon" regardless of how it was added.
  useEffect(() => {
    if (!activeProfile) { setInstalledAddons([]); return; }
    supabase.from('installed_addons').select('*').eq('profile_id', activeProfile.id).order('sort_order')
      .then(({ data, error }) => {
        if (error) { console.error('installed_addons error:', error); return; }
        setInstalledAddons((data ?? []) as InstalledAddon[]);
      });
  }, [activeProfile]);

  useEffect(() => {
    if (!selectedId) return;
    loadFolders(selectedId);

    const folderSub = supabase
      .channel(`folders-changes-${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folders', filter: `collection_id=eq.${selectedId}` }, () => loadFolders(selectedId))
      .subscribe();

    return () => { supabase.removeChannel(folderSub); };
  }, [selectedId]);
  useEffect(() => {
    if (!selectedFolder) { setSources([]); setCatalogs([]); return; }
    const fid = selectedFolder.id;
    supabase.from('folder_sources').select('*').eq('folder_id', fid).order('sort_order')
      .then(({ data, error }) => {
        if (error) console.error('folder_sources error:', error);
        setSources((data ?? []) as FolderSource[]);
      });
    supabase.from('folder_catalogs').select('*').eq('folder_id', fid)
      .then(({ data, error }) => {
        if (error) console.error('folder_catalogs error:', error);
        setCatalogs((data ?? []) as FolderCatalog[]);
      });
  }, [selectedFolder]);

  async function loadCollections() {
    setLoadError(null);
    const { data, error } = await supabase.from('collections').select('*').order('sort_order');
    if (error) {
      setLoadError(`Failed to load collections: ${error.message}`);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Collection[];
    setCollections(rows);
    if (rows.length) {
      const { data: f } = await supabase.from('folders').select('*').in('collection_id', rows.map((c) => c.id)).order('sort_order');
      setAllFolders((f ?? []) as Folder[]);
      setSelectedId((cur) => cur ?? rows[0].id);
    }
    setLoading(false);
  }

  async function loadFolders(collectionId: string) {
    const { data } = await supabase.from('folders').select('*').eq('collection_id', collectionId).order('sort_order');
    setFolders((data ?? []) as Folder[]);
    setSelectedFolder(null);
  }

  // ---- collections ----
  async function addCollection() {
    const name = prompt('Collection name')?.trim();
    if (!name) return;
    const { data } = await supabase.from('collections').insert({
      name, view_mode: 'FOLLOW_LAYOUT', sort_order: collections.length,
    }).select().single();
    if (data) { setCollections((p) => [...p, data as Collection]); setSelectedId((data as Collection).id); }
  }
  async function deleteCollection(id: string) {
    if (!confirm('Delete this collection and its folders?')) return;
    await supabase.from('collections').delete().eq('id', id);
    setCollections((p) => p.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(collections.find((c) => c.id !== id)?.id ?? null);
  }
  // Nests a collection under a folder (e.g. "Horror genre" under the
  // "Horror" folder in "Genres") — a collection can only have one parent at
  // a time, so this clears parent_collection_id if it had one.
  async function nestCollectionInFolder(collectionId: string, folderId: string) {
    setCollections((p) => p.map((c) => (c.id === collectionId ? { ...c, parent_folder_id: folderId, parent_collection_id: null } : c)));
    const { error } = await supabase
      .from('collections')
      .update({ parent_folder_id: folderId, parent_collection_id: null })
      .eq('id', collectionId);
    if (error) {
      console.error('Failed to nest collection in folder:', error);
      await loadCollections();
    }
  }

  // ---- tree (sidebar): nesting/reordering across collections + folders ----

  function isCollectionDescendant(candidateParentId: string, ofId: string): boolean {
    let cur: string | null | undefined = candidateParentId;
    while (cur) {
      if (cur === ofId) return true;
      cur = collections.find((c) => c.id === cur)?.parent_collection_id;
    }
    return false;
  }

  async function nestCollectionUnderCollection(childId: string, parentId: string) {
    if (childId === parentId || isCollectionDescendant(parentId, childId)) return;
    setCollections((p) => p.map((c) => (c.id === childId ? { ...c, parent_collection_id: parentId, parent_folder_id: null } : c)));
    const { error } = await supabase.from('collections').update({ parent_collection_id: parentId, parent_folder_id: null }).eq('id', childId);
    if (error) { console.error('Failed to nest collection:', error); await loadCollections(); }
  }

  async function toggleCollectionEnabled(id: string, enabled: boolean) {
    setCollections((p) => p.map((c) => (c.id === id ? { ...c, enabled } : c)));
    const { error } = await supabase.from('collections').update({ enabled }).eq('id', id);
    if (error) { console.error('Failed to toggle collection enabled:', error); await loadCollections(); }
  }

  async function unnestCollection(id: string) {
    setCollections((p) => p.map((c) => (c.id === id ? { ...c, parent_collection_id: null, parent_folder_id: null } : c)));
    const { error } = await supabase.from('collections').update({ parent_collection_id: null, parent_folder_id: null }).eq('id', id);
    if (error) { console.error('Failed to un-nest collection:', error); await loadCollections(); }
  }

  function isFolderDescendant(candidateParentId: string, ofId: string): boolean {
    let cur: string | null | undefined = candidateParentId;
    while (cur) {
      if (cur === ofId) return true;
      cur = allFolders.find((f) => f.id === cur)?.parent_folder_id;
    }
    return false;
  }

  async function nestFolderUnderFolder(folderId: string, parentFolderId: string) {
    if (folderId === parentFolderId || isFolderDescendant(parentFolderId, folderId)) return;
    setAllFolders((p) => p.map((f) => (f.id === folderId ? { ...f, parent_folder_id: parentFolderId } : f)));
    const { error } = await supabase.from('folders').update({ parent_folder_id: parentFolderId }).eq('id', folderId);
    if (error) { console.error('Failed to nest folder:', error); await loadCollections(); }
  }

  async function toggleFolderEnabledTree(id: string, enabled: boolean) {
    setAllFolders((p) => p.map((f) => (f.id === id ? { ...f, enabled } : f)));
    const { error } = await supabase.from('folders').update({ enabled }).eq('id', id);
    if (error) { console.error('Failed to toggle folder enabled:', error); await loadCollections(); }
    if (selectedFolder?.id === id) setSelectedFolder((p) => (p ? { ...p, enabled } : p));
  }

  async function unnestFolder(id: string) {
    setAllFolders((p) => p.map((f) => (f.id === id ? { ...f, parent_folder_id: null } : f)));
    const { error } = await supabase.from('folders').update({ parent_folder_id: null }).eq('id', id);
    if (error) { console.error('Failed to un-nest folder:', error); await loadCollections(); }
  }

  // Reorders collections sharing the same tree parent (root level, under
  // another collection, or under a folder) — sort_order is still one global
  // column on `collections`, so this only touches the rows that share the
  // dragged item's new parent, leaving everyone else's order untouched.
  async function reorderCollectionSiblings(draggedId: string, targetId: string, zone: 'before' | 'after', parentKey: string | null) {
    const dragged = collections.find((c) => c.id === draggedId);
    const target = collections.find((c) => c.id === targetId);
    if (!dragged || !target) return;
    const parentCollectionId = parentKey?.startsWith('collection:') ? parentKey.slice('collection:'.length) : null;
    const parentFolderId = parentKey?.startsWith('folder:') ? parentKey.slice('folder:'.length) : null;

    const siblings = collections
      .filter((c) => c.id !== draggedId && c.parent_collection_id === parentCollectionId && c.parent_folder_id === parentFolderId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const targetIdx = siblings.findIndex((c) => c.id === targetId);
    if (targetIdx === -1) return;
    const insertAt = zone === 'before' ? targetIdx : targetIdx + 1;
    siblings.splice(insertAt, 0, { ...dragged, parent_collection_id: parentCollectionId, parent_folder_id: parentFolderId });

    setCollections((prev) => {
      const byId = new Map(siblings.map((c, i) => [c.id, i]));
      return prev.map((c) => (byId.has(c.id) ? { ...c, sort_order: byId.get(c.id)!, parent_collection_id: parentCollectionId, parent_folder_id: parentFolderId } : c));
    });
    await Promise.all(siblings.map((c, i) =>
      supabase.from('collections').update({ sort_order: i, parent_collection_id: parentCollectionId, parent_folder_id: parentFolderId }).eq('id', c.id)
    ));
  }

  // Same idea for folders — siblings share either a parent folder or (for
  // top-level folders) their collection_id.
  async function reorderFolderSiblings(draggedId: string, targetId: string, zone: 'before' | 'after', parentKey: string) {
    const dragged = allFolders.find((f) => f.id === draggedId);
    const target = allFolders.find((f) => f.id === targetId);
    if (!dragged || !target) return;
    const parentFolderId = parentKey.startsWith('folder:') ? parentKey.slice('folder:'.length) : null;
    const collectionId = parentKey.startsWith('collection:') ? parentKey.slice('collection:'.length) : dragged.collection_id;

    const siblings = allFolders
      .filter((f) => f.id !== draggedId && f.collection_id === collectionId && f.parent_folder_id === parentFolderId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const targetIdx = siblings.findIndex((f) => f.id === targetId);
    if (targetIdx === -1) return;
    const insertAt = zone === 'before' ? targetIdx : targetIdx + 1;
    siblings.splice(insertAt, 0, { ...dragged, parent_folder_id: parentFolderId });

    setAllFolders((prev) => {
      const byId = new Map(siblings.map((f, i) => [f.id, i]));
      return prev.map((f) => (byId.has(f.id) ? { ...f, sort_order: byId.get(f.id)!, parent_folder_id: parentFolderId } : f));
    });
    await Promise.all(siblings.map((f, i) =>
      supabase.from('folders').update({ sort_order: i, parent_folder_id: parentFolderId }).eq('id', f.id)
    ));
  }

  // ---- folders ----
  async function addFolder() {
    if (!selectedId) return;
    const name = prompt('Folder name')?.trim();
    if (!name) return;
    const { data } = await supabase.from('folders').insert({
      collection_id: selectedId, name, sort_order: folders.length, tile_shape: 'poster', enabled: true,
    }).select().single();
    if (data) { setFolders((p) => [...p, data as Folder]); setAllFolders((p) => [...p, data as Folder]); }
  }
  async function reorderFolders(to: number) {
    if (folderDrag.current === null || folderDrag.current === to) return;
    const next = [...folders];
    const [moved] = next.splice(folderDrag.current, 1);
    next.splice(to, 0, moved);
    setFolders(next);
    folderDrag.current = null;
    await Promise.all(next.map((f, i) => supabase.from('folders').update({ sort_order: i }).eq('id', f.id)));
  }
  async function moveFolderUp(i: number) {
    if (i === 0) return;
    folderDrag.current = i;
    await reorderFolders(i - 1);
  }
  async function moveFolderDown(i: number) {
    if (i === folders.length - 1) return;
    folderDrag.current = i;
    await reorderFolders(i + 1);
  }
  async function deleteFolder(id: string) {
    if (!confirm('Delete this folder and its sources?')) return;
    await supabase.from('folder_catalogs').delete().eq('folder_id', id);
    await supabase.from('folder_sources').delete().eq('folder_id', id);
    await supabase.from('folders').delete().eq('id', id);
    setFolders((p) => p.filter((f) => f.id !== id));
    setAllFolders((p) => p.filter((f) => f.id !== id));
    if (selectedFolder?.id === id) setSelectedFolder(null);
  }
  async function saveFolderArtwork(patch: Partial<Folder>) {
    if (!selectedFolder) return;
    await supabase.from('folders').update(patch).eq('id', selectedFolder.id);
    const updated = { ...selectedFolder, ...patch } as Folder;
    setSelectedFolder(updated);
    setFolders((p) => p.map((f) => (f.id === updated.id ? updated : f)));
  }

  async function saveCollectionSettings(patch: Partial<Collection>) {
    if (!selectedId) return;
    const { error } = await supabase.from('collections').update(patch).eq('id', selectedId);
    if (error) throw new Error(error.message);
    setCollections((p) => p.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)));
  }

  // ---- folder_sources (TMDB/provider) ----
  async function addSource(provider: string) {
    if (!selectedFolder) return;
    const { data } = await supabase.from('folder_sources').insert({
      folder_id: selectedFolder.id, provider, sort_order: sources.length,
    }).select().single();
    if (data) setSources((p) => [...p, data as FolderSource]);
  }
  async function deleteSource(id: string) {
    await supabase.from('folder_sources').delete().eq('id', id);
    setSources((p) => p.filter((s) => s.id !== id));
  }

  // ---- folder_catalogs (Stremio catalog) ----
  async function addCatalog(catalogId: string, mediaType: string, genre: string | null, addonId: string | null = null) {
    if (!selectedFolder) return;
    const { data } = await supabase.from('folder_catalogs').insert({
      folder_id: selectedFolder.id, catalog_id: catalogId, media_type: mediaType,
      genre: genre ?? null, addon_id: addonId,
    }).select().single();
    if (data) setCatalogs((p) => [...p, data as FolderCatalog]);
  }
  async function deleteCatalog(id: string) {
    await supabase.from('folder_catalogs').delete().eq('id', id);
    setCatalogs((p) => p.filter((c) => c.id !== id));
  }

  // ---- JSON pack import ----
  async function importPack(pack: Record<string, unknown>, discoverMap?: Map<string, string>) {
    const p = pack as any;

    // Detect format: Moonlit = top-level array of collections with nested folders+sources
    if (Array.isArray(p)) {
      return importMoonlitPack(p, discoverMap);
    }
    // BEST format: object with flat collections[], folders[], folder_catalogs[] arrays
    return importBESTPack(p);
  }

  // ---- Moonlit format import ----
  // Top-level array: [{ id, title, folders: [{ id, title, sources: [...], heroBackdropUrl, tileShape }] }]
  async function importMoonlitPack(moonlit: any[], discoverMap?: Map<string, string>) {
    let totalCollections = 0, totalFolders = 0, totalSources = 0, totalSkipped = 0;

    for (let ci = 0; ci < moonlit.length; ci++) {
      const col = moonlit[ci];
      const colName: string = col.title ?? col.name ?? `Collection ${ci + 1}`;
      const moonlitFolders: any[] = Array.isArray(col.folders) ? col.folders : [];

      // Use first folder's heroBackdropUrl as collection backdrop if none set
      const firstHero = moonlitFolders[0]?.heroBackdropUrl ?? null;

      const { data: colRow, error: colErr } = await supabase.from('collections').insert({
        name: colName,
        view_mode: col.viewMode ?? 'FOLLOW_LAYOUT',
        show_all_tab: col.showAllTab ?? false,
        pin_to_top: col.pinToTop ?? false,
        backdrop_image: col.backdropImageUrl ?? firstHero,
        sort_order: collections.length + ci,
        // Round-trip tab visibility / publish state / display section when
        // the pack carries them (our own export format); a pack from an
        // older export or another source without these fields still lands
        // as an intentionally invisible draft rather than silently omitting
        // the columns and inheriting whatever the table default happens to be.
        show_ios_home: col.showIosHome ?? false,
        show_ios_movies: col.showIosMovies ?? false,
        show_ios_series: col.showIosSeries ?? false,
        show_mac_home: col.showMacHome ?? false,
        show_mac_movies: col.showMacMovies ?? false,
        show_mac_series: col.showMacSeries ?? false,
        status: col.status ?? 'draft',
        display_section: col.displaySection ?? null,
      }).select().single();
      if (colErr || !colRow) continue;
      const collectionId = (colRow as Collection).id;
      totalCollections++;

      for (let fi = 0; fi < moonlitFolders.length; fi++) {
        const f = moonlitFolders[fi];
        const shape = normalizeShape(f.tileShape ?? f.tile_shape);
        const { data: folderRow, error: folderErr } = await supabase.from('folders').insert({
          collection_id: collectionId,
          name: f.title ?? f.name ?? `Folder ${fi + 1}`,
          cover_image: f.coverImageUrl ?? f.cover_image ?? null,
          hero_backdrop: f.heroBackdropUrl ?? f.hero_backdrop ?? null,
          focus_gif: f.focusGifUrl ?? f.focus_gif ?? null,
          title_logo: f.titleLogoUrl ?? f.title_logo ?? null,
          hero_video_url: f.heroVideoUrl ?? f.hero_video_url ?? null,
          hide_title: f.hideTitle ?? f.hide_title ?? false,
          tile_shape: shape,
          focus_gif_enabled: f.focusGifEnabled ?? f.focus_gif_enabled ?? false,
          enabled: f.enabled ?? true,
          sort_order: fi,
        }).select().single();
        if (folderErr || !folderRow) continue;
        const folderId = (folderRow as Folder).id;
        totalFolders++;

        // Import sources as folder_catalogs
        const rawSources: any[] = Array.isArray(f.sources) ? f.sources : [];
        // Dedupe: prefer catalogSources (has richer data) over sources if both present
        const sources = Array.isArray(f.catalogSources) && f.catalogSources.length > 0
          ? f.catalogSources
          : rawSources;
        const seenCatalogIds = new Set<string>();
        for (let si = 0; si < sources.length; si++) {
          const src = sources[si];
          const catalogId = resolveMoonlitCatalogId(src, discoverMap);
          if (!catalogId) { totalSkipped++; continue; }
          const dedupeKey = `${folderId}:${catalogId}`;
          if (seenCatalogIds.has(dedupeKey)) continue;
          seenCatalogIds.add(dedupeKey);

          const mediaType = normalizeMediaType(src.type ?? src.mediaType);
          const genre = src.genre && src.genre.toLowerCase() !== 'none' ? src.genre : null;

          const { error } = await supabase.from('folder_catalogs').insert({
            folder_id: folderId,
            catalog_id: catalogId,
            media_type: mediaType,
            genre,
          });
          if (!error) totalSources++;
        }
      }
    }

    await loadCollections();
    return { collections: totalCollections, folders: totalFolders, sources: totalSources, skipped: totalSkipped };
  }

  function resolveMoonlitCatalogId(src: any, discoverMap?: Map<string, string>): string | null {
    if (src.catalogId) return src.catalogId;
    if (src.traktListId) return `trakt.list.${src.traktListId}`;
    if (src.tmdbId && src.tmdbSourceType?.toUpperCase() === 'COLLECTION') return `tmdb.collection.${src.tmdbId}`;
    if (src.tmdbSourceType?.toUpperCase() === 'DISCOVER') {
      const title = (src.title ?? '').toLowerCase();
      if (discoverMap) return discoverMap.get(title) ?? null;
      // fallback: small hard-coded table for the 6 common generic catalogs
      const mt = normalizeMediaType(src.type ?? src.mediaType);
      const known: Record<string, string> = {
        'movie:new movies': 'tmdb.discover.movie.new-movies.069d5312',
        'movie:popular movies': 'tmdb.discover.movie.popular-movies.29727d26',
        'movie:top all time movies': 'tmdb.discover.movie.top-all-time-movies.39f5a0c4',
        'series:new series': 'tmdb.discover.series.new-series.76fc7ade',
        'series:popular series': 'tmdb.discover.series.popular-series.20af3ad9',
        'series:top all time series': 'tmdb.discover.series.top-all-time-series.53046f30',
      };
      return known[`${mt}:${title}`] ?? null;
    }
    return null;
  }

  function normalizeMediaType(v?: string): string {
    switch (v?.toUpperCase()) { case 'TV': case 'SERIES': return 'series'; case 'MOVIE': return 'movie'; default: return v?.toLowerCase() ?? 'movie'; }
  }

  function normalizeShape(v?: string): string {
    switch (v?.toUpperCase()) { case 'LANDSCAPE': return 'landscape'; case 'SQUARE': return 'square'; default: return 'poster'; }
  }

  // ---- BEST format import (existing logic) ----
  async function importBESTPack(p: any) {
    const col = p.collections?.[0] ?? { name: p.pack?.title ?? 'Imported pack' };
    const { data: colRow, error: colErr } = await supabase.from('collections').insert({
      name: col.name ?? 'Imported pack',
      view_mode: col.view_mode ?? 'FOLLOW_LAYOUT',
      backdrop_image: col.backdrop_image ?? null,
      sort_order: collections.length,
    }).select().single();
    if (colErr || !colRow) throw new Error(colErr?.message ?? 'collection insert failed');
    const collectionId = (colRow as Collection).id;

    const nameToId: Record<string, string> = {};
    let folderCount = 0;
    const folderList: any[] = Array.isArray(p.folders) ? p.folders : [];
    for (let i = 0; i < folderList.length; i++) {
      const f = folderList[i];
        const { data } = await supabase.from('folders').insert({
          collection_id: collectionId,
          name: f.name ?? `Folder ${i + 1}`,
          cover_image: f.cover_image ?? null,
          hero_backdrop: f.hero_backdrop ?? null,
          focus_gif: f.focus_gif ?? null,
          title_logo: f.title_logo ?? null,
          hero_video_url: f.hero_video_url ?? null,
          hide_title: f.hide_title ?? false,
          tile_shape: f.tile_shape ?? 'POSTER',
          focus_gif_enabled: f.focus_gif_enabled ?? true,
          enabled: true,
          sort_order: i,
        }).select().single();
      if (data) { nameToId[(data as Folder).name] = (data as Folder).id; folderCount++; }
    }

    let sourceCount = 0;
    const perFolder: Record<string, number> = {};

    const cats: any[] = Array.isArray(p.folder_catalogs) ? p.folder_catalogs : [];
    for (const c of cats) {
      const fid = nameToId[c.folder_name ?? c.folder];
      if (!fid) continue;
      const idx = perFolder[fid] ?? 0;
      const { error } = await supabase.from('folder_catalogs').insert({
        folder_id: fid,
        catalog_id: c.catalog_id ?? c.provider ?? 'unknown',
        media_type: c.media_type ?? 'movie',
        genre: c.genre ?? null,
        extras: c.extras ?? null,
      });
      if (!error) { sourceCount++; perFolder[fid] = idx + 1; }
    }

    const srcs: any[] = Array.isArray(p.folder_sources) ? p.folder_sources : [];
    for (const s of srcs) {
      const fid = nameToId[s.folder_name ?? s.folder];
      if (!fid) continue;
      const idx = perFolder[fid] ?? 0;
      const { error } = await supabase.from('folder_sources').insert({
        folder_id: fid, provider: s.provider ?? 'unknown',
        title: s.title ?? null, tmdb_id: s.tmdb_id ?? null,
        media_type: s.media_type ?? null, sort_order: idx,
      });
      if (!error) { sourceCount++; perFolder[fid] = idx + 1; }
    }

    await loadCollections();
    setSelectedId(collectionId);
    return { collections: 1, folders: folderCount, sources: sourceCount, skipped: 0 };
  }

  const selected = useMemo(
    () => collections.find((c) => c.id === selectedId) ?? null,
    [collections, selectedId],
  );

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Admin · Catalog</p>
          <h1 className="font-display text-[clamp(30px,4vw,46px)] font-extrabold uppercase">Collection manager</h1>
          <p className="mt-1 text-sm text-muted">
            Edit collections, folders, sources and <span className="text-accent">every artwork slot</span> — with live previews.
          </p>
        </div>
        <div className="flex gap-2.5">
          <Button variant="ghost" size="sm" onClick={() => { setLoading(true); loadCollections(); }}>↺ Refresh</Button>
          <Button variant="ghost" size="sm" onClick={() => setTab('json')}>⤵ Import pack JSON</Button>
          <Button size="sm" onClick={addCollection}>+ New collection</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* sidebar */}
        <aside className="h-fit rounded-2xl border border-border bg-surface p-3.5 lg:sticky lg:top-20">
          {loadError && (
            <div className="mb-2 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 font-mono text-[11px] text-red-400">
              {loadError}
            </div>
          )}
          {loading ? (
            <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />)}</div>
          ) : (
            <CollectionTree
              collections={collections}
              allFolders={allFolders}
              selectedId={selectedId}
              selectedFolderId={selectedFolder?.id ?? null}
              onSelectCollection={setSelectedId}
              onSelectFolder={(f) => { setSelectedId(f.collection_id); setSelectedFolder(f); setTab('artwork'); }}
              onAddCollection={addCollection}
              onDeleteCollection={deleteCollection}
              onToggleCollectionEnabled={toggleCollectionEnabled}
              onToggleFolderEnabled={toggleFolderEnabledTree}
              onNestCollectionUnderCollection={nestCollectionUnderCollection}
              onNestCollectionUnderFolder={nestCollectionInFolder}
              onNestFolderUnderFolder={nestFolderUnderFolder}
              onUnnestCollection={unnestCollection}
              onUnnestFolder={unnestFolder}
              onReorderCollectionSiblings={reorderCollectionSiblings}
              onReorderFolderSiblings={reorderFolderSiblings}
            />
          )}
        </aside>

        {/* main */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex gap-0.5 border-b border-border px-4 pt-3.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-[13px] transition-colors ${
                  tab === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {!selected ? (
              <div className="py-16 text-center text-sm text-muted">Select or create a collection to begin.</div>
            ) : tab === 'folders' ? (
              <FolderGrid
                collection={selected}
                folders={folders}
                onSelectFolder={(f) => { setSelectedFolder(f); setTab('artwork'); }}
                onAddFolder={addFolder}
                onDragStart={(i) => (folderDrag.current = i)}
                onDrop={reorderFolders}
                onMoveUp={moveFolderUp}
                onMoveDown={moveFolderDown}
                onDeleteFolder={deleteFolder}
              />
            ) : tab === 'artwork' ? (
              selectedFolder ? (
                <ArtworkGallery folder={selectedFolder} onBack={() => setTab('folders')} onSave={saveFolderArtwork} />
              ) : (
                <div className="py-16 text-center text-sm text-muted">Pick a folder from the Folders tab to edit its artwork.</div>
              )
            ) : tab === 'sources' ? (
              selectedFolder ? (
                <SourcesTable
                  folder={selectedFolder}
                  sources={sources}
                  catalogs={catalogs}
                  onAddSource={addSource}
                  onDeleteSource={deleteSource}
                  onAddCatalog={addCatalog}
                  onDeleteCatalog={deleteCatalog}
                  addons={installedAddons}
                />
              ) : (
                <div className="py-16 text-center text-sm text-muted">Pick a folder from the Folders tab to edit its sources.</div>
              )
            ) : tab === 'collection' ? (
              <CollectionSettings
                collection={selected}
                folders={folders}
                allCollections={collections}
                onSave={saveCollectionSettings}
              />
            ) : (
              <JsonImport onImport={importPack} />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
