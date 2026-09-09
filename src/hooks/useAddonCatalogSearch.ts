import { useEffect, useState } from 'react';

// The default bundled addon (see useFolderPreviewPosters.ts's own note) —
// this manifest is the same backend that resolves every catalog_id typed
// into folder_catalogs throughout the portal, so searching its own catalog
// list is the direct fix for "don't make admins type raw catalog ids blind."
const AIOMETADATA_MANIFEST = 'https://aiometadata.fortheweak.cloud/stremio/1bf2cd94-2057-4992-9ed7-a8464f12e4a4/manifest.json';

export interface AddonCatalogEntry {
  id: string;
  type: string; // "movie" | "series"
  name: string;
}

let cached: Promise<AddonCatalogEntry[]> | null = null;

function loadCatalogs(): Promise<AddonCatalogEntry[]> {
  if (!cached) {
    cached = fetch(AIOMETADATA_MANIFEST)
      .then((res) => (res.ok ? res.json() : { catalogs: [] }))
      .then((data: { catalogs?: AddonCatalogEntry[] }) => data.catalogs ?? [])
      .catch(() => []);
  }
  return cached;
}

/** Every catalog the default addon exposes (~1,500), searchable by name —
 *  powers the "search for a source instead of typing a catalog id" picker.
 *  Loaded once per page session. */
export function useAddonCatalogSearch() {
  const [catalogs, setCatalogs] = useState<AddonCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadCatalogs().then((result) => {
      if (!cancelled) { setCatalogs(result); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  return { catalogs, loading };
}
