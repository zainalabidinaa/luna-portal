import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface HomeBrowseTile {
  id: string;
  kind: 'genre' | 'language';
  name: string;
  iso: string | null;
  sort_order: number;
}

/** Home's "Browse by Genre"/"Browse by Language" strips — see
 *  supabase/migrations/20260912_home_browse_tiles.sql and
 *  HomeBrowseTilesStore.swift. Both kinds live in one table; this hook
 *  exposes them split and CRUD'd per kind since the two strips are edited
 *  independently in the portal. */
export function useHomeBrowseTiles() {
  const [tiles, setTiles] = useState<HomeBrowseTile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('home_browse_tiles').select('*').order('kind').order('sort_order');
    if (error) { console.error('Failed to load home_browse_tiles:', error); setLoading(false); return; }
    setTiles((data as HomeBrowseTile[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const genres = tiles.filter((t) => t.kind === 'genre').sort((a, b) => a.sort_order - b.sort_order);
  const languages = tiles.filter((t) => t.kind === 'language').sort((a, b) => a.sort_order - b.sort_order);

  async function addTile(kind: 'genre' | 'language', name: string, iso: string | null) {
    const siblingCount = tiles.filter((t) => t.kind === kind).length;
    const { data, error } = await supabase.from('home_browse_tiles')
      .insert({ kind, name, iso, sort_order: siblingCount }).select().single();
    if (error) { alert(error.message); return; }
    setTiles((p) => [...p, data as HomeBrowseTile]);
  }

  async function deleteTile(id: string) {
    await supabase.from('home_browse_tiles').delete().eq('id', id);
    setTiles((p) => p.filter((t) => t.id !== id));
  }

  async function reorderTile(kind: 'genre' | 'language', draggedId: string, targetId: string, zone: 'before' | 'after') {
    const siblings = tiles.filter((t) => t.kind === kind && t.id !== draggedId).sort((a, b) => a.sort_order - b.sort_order);
    const dragged = tiles.find((t) => t.id === draggedId);
    const targetIdx = siblings.findIndex((t) => t.id === targetId);
    if (!dragged || targetIdx === -1) return;
    siblings.splice(zone === 'before' ? targetIdx : targetIdx + 1, 0, dragged);
    setTiles((prev) => {
      const byId = new Map(siblings.map((t, i) => [t.id, i]));
      return prev.map((t) => (byId.has(t.id) ? { ...t, sort_order: byId.get(t.id)! } : t));
    });
    await Promise.all(siblings.map((t, i) => supabase.from('home_browse_tiles').update({ sort_order: i }).eq('id', t.id)));
  }

  return { genres, languages, loading, addTile, deleteTile, reorderTile, refresh };
}
