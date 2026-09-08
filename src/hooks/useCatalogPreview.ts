import { useCallback, useEffect, useState } from 'react';

export interface PreviewItem {
  id: string;
  name: string;
  poster: string | null;
}

/** Stremio catalog endpoint for one catalog on one addon. Addon URLs are
 *  stored as their manifest URL, so swap the manifest suffix for the catalog
 *  path. */
export function catalogUrlFor(addonUrl: string, type: string, catalogId: string): string {
  const base = addonUrl.replace(/\/manifest\.json$/, '').replace(/\/$/, '');
  return `${base}/catalog/${type}/${catalogId}.json`;
}

/**
 * GETs a catalog and returns how many metas the addon handed back — 0 for a
 * dead catalog, ~50 for a healthy one. This is the same check that surfaced
 * `trakt.anticipated.shows` returning 2 of a 50-item upstream list and
 * `mdblist.20340` returning 0: a folder's admin view had no way to see that
 * short of manually curling the addon. Throws on a network/HTTP failure —
 * callers treat "couldn't check" and "checked, got 0" as distinct states.
 */
export async function probeCatalog(addonUrl: string, type: string, catalogId: string): Promise<number> {
  const res = await fetch(catalogUrlFor(addonUrl, type, catalogId));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.metas) ? json.metas.length : 0;
}

export type CatalogHealth =
  | { status: 'checking' }
  | { status: 'ok'; count: number }
  | { status: 'error'; message: string };

/** Probes a catalog once on mount (unlike `useCatalogPreview`, which is lazy
 *  and gated on `enabled`) so a source row can show a health badge without
 *  the admin needing to expand it first — the whole point being that a dead
 *  catalog is otherwise invisible until someone happens to look. */
export function useCatalogHealth(addonUrl: string | null, type: string, catalogId: string): CatalogHealth {
  const [health, setHealth] = useState<CatalogHealth>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    if (!addonUrl) {
      setHealth({ status: 'error', message: 'No addon linked' });
      return;
    }
    setHealth({ status: 'checking' });
    probeCatalog(addonUrl, type, catalogId)
      .then((count) => { if (!cancelled) setHealth({ status: 'ok', count }); })
      .catch((e) => { if (!cancelled) setHealth({ status: 'error', message: (e as Error).message }); });
    return () => { cancelled = true; };
  }, [addonUrl, type, catalogId]);

  return health;
}

/** Fetches the first few items of one catalog for an inline preview. Lazy:
 *  nothing is requested until `enabled` flips true, so collapsed rows cost
 *  nothing. A failed/slow addon yields an error string rather than throwing —
 *  a preview is best-effort and must never break the surrounding editor. */
export function useCatalogPreview(
  addonUrl: string | null,
  type: string,
  catalogId: string,
  enabled: boolean,
) {
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!addonUrl) {
      setError('No addon linked');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(catalogUrlFor(addonUrl, type, catalogId));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const metas = Array.isArray(json.metas) ? json.metas : [];
      setItems(
        metas.slice(0, 6).map((m: Record<string, unknown>) => ({
          id: String(m.id ?? ''),
          name: String(m.name ?? ''),
          poster: typeof m.poster === 'string' ? m.poster : null,
        })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [addonUrl, type, catalogId]);

  useEffect(() => {
    if (enabled && items === null && !loading && !error) load();
  }, [enabled, items, loading, error, load]);

  return { items, loading, error, reload: load };
}
