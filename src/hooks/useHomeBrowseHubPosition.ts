import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface HomeBrowseHubPosition {
  kind: 'genre' | 'language';
  insert_at_index: number | null;
}

/** Where "Browse by Genre"/"Browse by Language" insert into the "Your
 *  Widgets" editor's ordered widget list — see
 *  supabase/migrations/20260914_home_browse_hub_position.sql and
 *  HomeBrowseTilesStore.insertAtIndex(kind:). `null` keeps the strip pinned
 *  last, matching the pre-portal-control default. */
export function useHomeBrowseHubPosition() {
  const [positions, setPositions] = useState<HomeBrowseHubPosition[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('home_browse_hub_position').select('*');
    if (error) { console.error('Failed to load home_browse_hub_position:', error); setLoading(false); return; }
    setPositions((data as HomeBrowseHubPosition[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function insertAtIndex(kind: 'genre' | 'language'): number | null {
    return positions.find((p) => p.kind === kind)?.insert_at_index ?? null;
  }

  async function setInsertAtIndex(kind: 'genre' | 'language', value: number | null) {
    const { error } = await supabase.from('home_browse_hub_position')
      .update({ insert_at_index: value, updated_at: new Date().toISOString() }).eq('kind', kind);
    if (error) { alert(error.message); return; }
    setPositions((prev) => prev.map((p) => (p.kind === kind ? { ...p, insert_at_index: value } : p)));
  }

  return { loading, insertAtIndex, setInsertAtIndex, refresh };
}
