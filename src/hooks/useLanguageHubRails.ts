import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LanguageHubRail } from '../types';

/**
 * Rows relevant to one language: its own tier='general'/'featured' rows
 * (iso = this language) plus the shared tier='general' iso=null defaults —
 * mirrors MacLanguageHubView's own resolution (see
 * supabase/migrations/20260911_language_hub_rails.sql) so what the portal
 * shows here is exactly what the app would fall back to or override.
 */
export function useLanguageHubRails(iso: string | null) {
  const [rows, setRows] = useState<LanguageHubRail[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!iso) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('language_hub_rails')
      .select('*')
      .or(`iso.eq.${iso},iso.is.null`)
      .order('tier', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) { console.error('Failed to load language_hub_rails:', error); setRows([]); setLoading(false); return; }
    setRows((data as LanguageHubRail[]) ?? []);
    setLoading(false);
  }, [iso]);

  useEffect(() => { refresh(); }, [refresh]);

  async function addRow(row: Omit<LanguageHubRail, 'id'>) {
    const { data, error } = await supabase.from('language_hub_rails').insert(row).select().single();
    if (error) { alert(error.message); return; }
    setRows((p) => [...p, data as LanguageHubRail]);
  }

  async function updateRow(id: string, patch: Partial<LanguageHubRail>) {
    const { error } = await supabase.from('language_hub_rails').update(patch).eq('id', id);
    if (error) { alert(error.message); return; }
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function deleteRow(id: string) {
    await supabase.from('language_hub_rails').delete().eq('id', id);
    setRows((p) => p.filter((r) => r.id !== id));
  }

  return { rows, loading, addRow, updateRow, deleteRow, refresh };
}
