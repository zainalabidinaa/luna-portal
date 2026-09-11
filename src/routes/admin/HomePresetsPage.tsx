import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { WidgetGrid, TAB_FLAG, type WidgetTab, type WidgetCardItem } from '../../components/catalog/WidgetGrid';
import { WidgetEditor } from '../../components/catalog/WidgetEditor';
import { cloneCollection } from '../../lib/cloneCollection';
import type { Collection, Folder, HomePreset, HomePresetItem } from '../../types';

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Mirrors GenreCatalog.normalize (Packages/MoonlitCore/.../GenreCatalog.swift)
// exactly — some collection names carry an invisible LRM/RLM/BOM prefix
// character (a leftover from RTL-locale authoring), which breaks a plain
// case-insensitive compare even though the visible name looks identical.
function normalizeCollectionName(s: string): string {
  return s
    .replace(/[\u200E\u200F\uFEFF]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 flex-none rounded-full transition-colors ${on ? 'bg-accent' : 'border border-border bg-surface-2'}`}
      title={on ? 'Active — visible to Premium/Friends & Family' : 'Inactive — hidden from the app'}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

type Screen = { kind: 'grid' } | { kind: 'editor'; collectionId: string };

export default function HomePresetsPage() {
  const [presets, setPresets] = useState<HomePreset[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  // null selectedPresetId = "All Widgets" mode (today's global tab-visibility
  // view). A real preset id = that preset's own per-tab item list.
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [widgetTab, setWidgetTab] = useState<WidgetTab>('home');
  const [presetItems, setPresetItems] = useState<HomePresetItem[]>([]);
  const [screen, setScreen] = useState<Screen>({ kind: 'grid' });
  const [showPresetPanel, setShowPresetPanel] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addExistingId, setAddExistingId] = useState('');
  const [addingExisting, setAddingExisting] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const mode: 'all' | 'preset' = selectedPresetId ? 'preset' : 'all';
  const selectedPreset = presets.find((p) => p.id === selectedPresetId) ?? null;

  async function loadPresets() {
    const { data } = await supabase.from('home_presets').select('*').order('sort_order');
    const loaded = (data as HomePreset[]) ?? [];
    setPresets(loaded);
    // Default to the active preset (Signature) rather than "All Widgets" —
    // that's what actually ships to the app, so it should be what an admin
    // sees first, with "All Widgets" and other presets still one click away.
    const defaultPreset = loaded.find((p) => p.slug === 'signature' && p.is_active) ?? loaded.find((p) => p.is_active);
    if (defaultPreset) setSelectedPresetId(defaultPreset.id);
  }

  async function loadPresetItems(presetId: string, tab: WidgetTab) {
    const { data } = await supabase
      .from('home_preset_items')
      .select('*')
      .eq('preset_id', presetId)
      .eq('tab', tab)
      .order('sort_order');
    setPresetItems((data as HomePresetItem[]) ?? []);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        loadPresets(),
        supabase.from('collections').select('*').order('sort_order').then(({ data }) => setCollections((data as Collection[]) ?? [])),
        supabase.from('folders').select('*').order('sort_order').then(({ data }) => setFolders((data as Folder[]) ?? [])),
      ]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    setShowAddPanel(false);
    setAddExistingId('');
    if (selectedPresetId) loadPresetItems(selectedPresetId, widgetTab);
    else setPresetItems([]);
  }, [selectedPresetId, widgetTab]);

  // ── preset metadata ──────────────────────────────────────────────────────

  async function createPreset() {
    const name = prompt('Preset name (e.g. "Arabic")');
    if (!name?.trim()) return;
    const slug = slugify(name);
    const { data, error } = await supabase
      .from('home_presets')
      .insert({ slug, name: name.trim(), is_active: false, sort_order: presets.length })
      .select()
      .single();
    if (error) { alert(error.message); return; }
    const created = data as HomePreset;
    setPresets((prev) => [...prev, created]);
    setSelectedPresetId(created.id);
    setShowPresetPanel(true);
  }

  async function updatePreset(patch: Partial<HomePreset>) {
    if (!selectedPreset) return;
    setPresets((prev) => prev.map((p) => (p.id === selectedPreset.id ? { ...p, ...patch } : p)));
    await supabase.from('home_presets').update(patch).eq('id', selectedPreset.id);
  }

  async function deletePreset() {
    if (!selectedPreset) return;
    if (!confirm(`Delete "${selectedPreset.name}"? This also removes its widget lists for every tab.`)) return;
    await supabase.from('home_presets').delete().eq('id', selectedPreset.id);
    setPresets((prev) => prev.filter((p) => p.id !== selectedPreset.id));
    setSelectedPresetId(null);
    setShowPresetPanel(false);
  }

  // ── widgets: grid data + mutations, mode-aware ──────────────────────────

  const allTabItems: WidgetCardItem[] = collections
    .filter((c) => !c.parent_collection_id && !c.parent_folder_id)
    .filter((c) => { const { ios, mac } = TAB_FLAG[widgetTab]; return Boolean(c[ios]) || Boolean(c[mac]); })
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ key: c.id, kind: 'collection' as const, collection: c }));

  const presetTabItems: WidgetCardItem[] = presetItems
    .map((item): WidgetCardItem | null => {
      if (item.data_source.kind === 'browseHub') {
        const hub = item.data_source.hub === 'language' ? 'language' : 'genre';
        return { key: item.id, kind: 'browseHub', hub };
      }
      const collectionId = item.data_source.kind === 'collection' ? item.data_source.collectionId : undefined;
      const collection = collectionId ? collections.find((c) => c.id === collectionId) : undefined;
      return collection ? { key: item.id, kind: 'collection', collection } : null;
    })
    .filter((x): x is WidgetCardItem => x !== null);

  const gridItems = mode === 'preset' ? presetTabItems : allTabItems;

  // The real, content-bearing collections "Browse by Genre"/"Browse by
  // Language" tiles open into — same collections GenreCatalog.genres(in:)/
  // LanguageCatalog.languages(in:) already read on-device, each with real
  // folders (one per genre/language) carrying real folder_sources/
  // folder_catalogs, editable through the exact same WidgetEditor every
  // other widget uses. No separate flat name-list editor needed anymore.
  const genresCollection = collections.find((c) => normalizeCollectionName(c.name) === 'genres');
  const languagesCollection = collections.find((c) => normalizeCollectionName(c.name) === 'languages');

  async function addNewWidget(): Promise<Collection | null> {
    const name = prompt('Widget name')?.trim();
    if (!name) return null;
    const { ios, mac } = TAB_FLAG[widgetTab];
    const { data, error } = await supabase.from('collections').insert({
      name, view_mode: 'FOLLOW_LAYOUT', sort_order: collections.length,
      status: 'draft', [ios]: true, [mac]: true,
    }).select().single();
    if (error) { alert(error.message); return null; }
    const created = data as Collection;
    setCollections((p) => [...p, created]);
    return created;
  }

  async function handleAddWidget() {
    if (mode === 'all') {
      const created = await addNewWidget();
      if (created) setScreen({ kind: 'editor', collectionId: created.id });
      return;
    }
    setShowAddPanel(true);
  }

  // "Add existing" deliberately clones the source widget rather than
  // reusing its collection id — otherwise this tab's card and the source
  // tab's card would point at the same `collections` row, and editing
  // either one would edit both. See src/lib/cloneCollection.ts.
  async function addExistingToPreset() {
    if (!selectedPresetId || !addExistingId) return;
    setAddingExisting(true);
    try {
      let clone: Collection;
      try {
        clone = await cloneCollection(addExistingId, widgetTab);
      } catch (e: any) {
        alert(`Failed to copy that widget: ${e.message}`);
        return;
      }
      setCollections((p) => [...p, clone]);
      const { data, error } = await supabase.from('home_preset_items').insert({
        preset_id: selectedPresetId, tab: widgetTab,
        data_source: { kind: 'collection', collectionId: clone.id },
        media_type: null, style: 'standard', sort_order: presetItems.length,
      }).select().single();
      if (error) { alert(error.message); return; }
      setPresetItems((p) => [...p, data as HomePresetItem]);
      setAddExistingId('');
      setShowAddPanel(false);
    } finally {
      setAddingExisting(false);
    }
  }

  // One-time repair for widgets that ended up shared across tabs before
  // "Add existing" started cloning (see cloneCollection.ts) — every
  // occurrence is kept (nothing is deleted or hidden), each additional
  // occurrence just gets its own independent `collections` row so editing
  // one no longer edits the others.
  async function repairLinkedWidgets() {
    if (!confirm('Scan every preset and tab for widgets that still share the same underlying widget, and give each occurrence its own independent copy? All widgets stay — only their linkage changes.')) return;
    setRepairing(true);
    try {
      let presetFixed = 0;
      let flagFixed = 0;
      const errors: string[] = [];

      // 1) home_preset_items: several items (any preset, any tab) pointing
      // at the same collections.id.
      const { data: allItemsRaw, error: itemsErr } = await supabase.from('home_preset_items').select('*').order('preset_id').order('tab').order('sort_order');
      if (itemsErr) console.error('repairLinkedWidgets: failed to fetch home_preset_items', itemsErr);
      const allItems = (allItemsRaw ?? []) as HomePresetItem[];
      const byCollection = new Map<string, HomePresetItem[]>();
      for (const item of allItems) {
        const cid = item.data_source.kind === 'collection' ? item.data_source.collectionId : undefined;
        if (!cid) continue;
        const group = byCollection.get(cid);
        if (group) group.push(item); else byCollection.set(cid, [item]);
      }
      const presetDupGroups = [...byCollection.values()].filter((g) => g.length > 1);
      for (const group of presetDupGroups) {
        // First occurrence keeps the original collection; every other
        // occurrence gets its own clone.
        for (const item of group.slice(1)) {
          let clone: Collection;
          try {
            clone = await cloneCollection(group[0].data_source.collectionId!, item.tab);
          } catch (e: any) {
            console.error('repairLinkedWidgets: clone failed for preset item', item, e);
            errors.push(e.message);
            continue;
          }
          const { error: updErr } = await supabase.from('home_preset_items')
            .update({ data_source: { kind: 'collection', collectionId: clone.id } })
            .eq('id', item.id);
          if (updErr) { console.error('repairLinkedWidgets: failed to repoint preset item', item, updErr); errors.push(updErr.message); continue; }
          presetFixed++;
        }
      }

      // 2) "All Widgets" tab-visibility flags: one collection flagged
      // visible on more than one tab at once (e.g. show_ios_home AND
      // show_ios_movies both true).
      const { data: allCollectionsRaw, error: colsErr } = await supabase.from('collections').select('*').order('sort_order');
      if (colsErr) console.error('repairLinkedWidgets: failed to fetch collections', colsErr);
      const allCollections = (allCollectionsRaw ?? []) as Collection[];
      const tabs: WidgetTab[] = ['home', 'movies', 'series'];
      const flagDupNames: string[] = [];
      for (const c of allCollections) {
        const onTabs = tabs.filter((t) => Boolean(c[TAB_FLAG[t].ios]) || Boolean(c[TAB_FLAG[t].mac]));
        if (onTabs.length <= 1) continue;
        flagDupNames.push(`${c.name} (${onTabs.join('/')})`);
        // Keep the first tab on the original row; clone one new,
        // independent collection per additional tab and move that tab's
        // flags onto the clone instead.
        const patch: Record<string, boolean> = {};
        for (const t of onTabs.slice(1)) {
          try {
            await cloneCollection(c.id, t);
          } catch (e: any) {
            console.error('repairLinkedWidgets: clone failed for collection', c, e);
            errors.push(e.message);
            continue;
          }
          patch[TAB_FLAG[t].ios] = false;
          patch[TAB_FLAG[t].mac] = false;
          flagFixed++;
        }
        if (Object.keys(patch).length) {
          const { error: patchErr } = await supabase.from('collections').update(patch).eq('id', c.id);
          if (patchErr) { console.error('repairLinkedWidgets: failed to clear flags on original', c, patchErr); errors.push(patchErr.message); }
        }
      }

      const presetDupNames = presetDupGroups.map((g) => {
        const name = allCollections.find((c) => c.id === g[0].data_source.collectionId)?.name ?? g[0].data_source.collectionId;
        return `${name} (${g.map((i) => i.tab).join('/')})`;
      });

      console.log('repairLinkedWidgets: scanned', allItems.length, 'preset items,', allCollections.length, 'collections.');
      console.log('repairLinkedWidgets: preset-item duplicate groups:', presetDupGroups.map((g) => ({ collectionId: g[0].data_source.collectionId, tabs: g.map((i) => i.tab) })));
      console.log('repairLinkedWidgets: collections visible on 2+ tabs:', flagDupNames);
      if (errors.length) console.error('repairLinkedWidgets: errors', errors);

      alert(
        `Scanned ${allCollections.length} widgets and ${allItems.length} preset entries.\n` +
        `Split ${presetFixed} preset widget${presetFixed === 1 ? '' : 's'} and ${flagFixed} tab-visibility widget${flagFixed === 1 ? '' : 's'} into independent copies.\n` +
        (presetDupNames.length ? `Preset widgets found shared across tabs: ${presetDupNames.join(', ')}\n` : '') +
        (flagDupNames.length ? `Widgets found on 2+ tabs: ${flagDupNames.join(', ')}\n` : (presetDupNames.length ? '' : 'No widget was flagged visible on 2+ tabs at once.\n')) +
        (errors.length ? `\n${errors.length} error(s), first: ${errors[0]}` : '')
      );
      await Promise.all([
        supabase.from('collections').select('*').order('sort_order').then(({ data }) => setCollections((data as Collection[]) ?? [])),
        selectedPresetId ? loadPresetItems(selectedPresetId, widgetTab) : Promise.resolve(),
      ]);
    } finally {
      setRepairing(false);
    }
  }

  // Which of "Browse by Genre"/"Browse by Language" this preset's Home list
  // doesn't already have a card for — each is a singleton per preset (one
  // strip, not a repeatable widget), same as the portal's own hardcoded
  // rendering always assumed.
  const availableBrowseHubs: ('genre' | 'language')[] = (['genre', 'language'] as const).filter(
    (hub) => !presetItems.some((i) => i.data_source.kind === 'browseHub' && i.data_source.hub === hub)
  );

  async function addBrowseHubToPreset(hub: 'genre' | 'language') {
    if (!selectedPresetId) return;
    const { data, error } = await supabase.from('home_preset_items').insert({
      preset_id: selectedPresetId, tab: 'home',
      data_source: { kind: 'browseHub', hub },
      media_type: null, style: 'standard', sort_order: presetItems.length,
    }).select().single();
    if (error) { alert(error.message); return; }
    setPresetItems((p) => [...p, data as HomePresetItem]);
    setShowAddPanel(false);
  }

  async function createAndAddToPreset() {
    if (!selectedPresetId) return;
    const created = await addNewWidget();
    if (!created) return;
    const { data, error } = await supabase.from('home_preset_items').insert({
      preset_id: selectedPresetId, tab: widgetTab,
      data_source: { kind: 'collection', collectionId: created.id },
      media_type: null, style: 'standard', sort_order: presetItems.length,
    }).select().single();
    if (!error) setPresetItems((p) => [...p, data as HomePresetItem]);
    setShowAddPanel(false);
    setScreen({ kind: 'editor', collectionId: created.id });
  }

  async function handleDeleteCard(item: WidgetCardItem) {
    // `browseHub` cards are preset-items-only — never reachable in "all"
    // mode (see `WidgetCardItem`'s own doc comment) — so `mode === 'all'`
    // here always means `item.kind === 'collection'`.
    if (mode === 'all' && item.kind === 'collection') {
      await supabase.from('collections').delete().eq('id', item.collection.id);
      setCollections((p) => p.filter((c) => c.id !== item.collection.id));
    } else {
      await supabase.from('home_preset_items').delete().eq('id', item.key);
      setPresetItems((p) => p.filter((i) => i.id !== item.key));
    }
  }

  async function handleReorderCard(draggedKey: string, targetKey: string, zone: 'before' | 'after') {
    if (mode === 'all') {
      const dragged = collections.find((c) => c.id === draggedKey);
      const target = collections.find((c) => c.id === targetKey);
      if (!dragged || !target) return;
      const siblings = allTabItems
        .filter((i): i is Extract<WidgetCardItem, { kind: 'collection' }> => i.kind === 'collection')
        .map((i) => i.collection)
        .filter((c) => c.id !== draggedKey);
      const targetIdx = siblings.findIndex((c) => c.id === targetKey);
      if (targetIdx === -1) return;
      siblings.splice(zone === 'before' ? targetIdx : targetIdx + 1, 0, dragged);
      setCollections((prev) => {
        const byId = new Map(siblings.map((c, i) => [c.id, i]));
        return prev.map((c) => (byId.has(c.id) ? { ...c, sort_order: byId.get(c.id)! } : c));
      });
      await Promise.all(siblings.map((c, i) => supabase.from('collections').update({ sort_order: i }).eq('id', c.id)));
    } else {
      const dragged = presetItems.find((i) => i.id === draggedKey);
      const target = presetItems.find((i) => i.id === targetKey);
      if (!dragged || !target) return;
      const siblings = presetItems.filter((i) => i.id !== draggedKey).sort((a, b) => a.sort_order - b.sort_order);
      const targetIdx = siblings.findIndex((i) => i.id === targetKey);
      if (targetIdx === -1) return;
      siblings.splice(zone === 'before' ? targetIdx : targetIdx + 1, 0, dragged);
      setPresetItems((prev) => {
        const byId = new Map(siblings.map((i, idx) => [i.id, idx]));
        return prev.map((i) => (byId.has(i.id) ? { ...i, sort_order: byId.get(i.id)! } : i));
      });
      await Promise.all(siblings.map((i, idx) => supabase.from('home_preset_items').update({ sort_order: idx }).eq('id', i.id)));
    }
  }

  const availableForPreset = collections.filter(
    (c) => !c.parent_collection_id && !c.parent_folder_id && !presetItems.some((i) => i.data_source.collectionId === c.id)
  );

  if (loading) {
    return (
      <AppShell>
        <p className="text-faint">Loading…</p>
      </AppShell>
    );
  }

  if (screen.kind === 'editor') {
    return (
      <AppShell>
        <WidgetEditor collectionId={screen.collectionId} onBack={() => setScreen({ kind: 'grid' })} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Widgets</h1>
          <p className="mt-1 text-sm text-muted">
            {mode === 'all'
              ? 'Every Home/Movies/Series widget — build and publish them here.'
              : <>Editing <span className="text-accent">{selectedPreset?.name}</span>'s widget list for this tab. Curated home layouts for Premium/Friends & Family — only <span className="text-accent">active</span> presets show up in the app.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={repairLinkedWidgets} disabled={repairing}>
            {repairing ? 'Splitting…' : 'Fix linked widgets'}
          </Button>
          <Button variant="ghost" size="sm" onClick={createPreset}>+ New Preset</Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={selectedPresetId ?? ''}
            onChange={(e) => setSelectedPresetId(e.target.value || null)}
            className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[12.5px] text-text outline-none focus:border-accent"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.is_active ? '' : ' (inactive)'}</option>
            ))}
          </select>
          {selectedPreset && (
            <button
              onClick={() => setShowPresetPanel((v) => !v)}
              title="Edit preset details"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-strong text-muted hover:border-accent hover:text-accent"
            >
              ⚙
            </button>
          )}
        </div>
        <div className="inline-flex rounded-lg border border-border-strong overflow-hidden">
          {(['home', 'movies', 'series'] as WidgetTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setWidgetTab(t)}
              className={`px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
                t === widgetTab ? 'bg-accent-light text-accent' : 'text-muted hover:text-text'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {selectedPreset && showPresetPanel && (
        <div className="mb-5 rounded-xl border border-border bg-surface p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-faint">Name</span>
              <input value={selectedPreset.name} onChange={(e) => updatePreset({ name: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-faint">Slug</span>
              <input value={selectedPreset.slug} onChange={(e) => updatePreset({ slug: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-sm text-text focus:border-accent focus:outline-none" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-faint">Description</span>
              <input value={selectedPreset.description ?? ''} onChange={(e) => updatePreset({ description: e.target.value || null })}
                className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-faint">Locale tag</span>
              <input value={selectedPreset.locale_tag ?? ''} onChange={(e) => updatePreset({ locale_tag: e.target.value || null })}
                placeholder="ar, tr, asian…"
                className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none" />
            </label>
            <div className="flex items-end gap-2">
              <span className="text-xs font-medium text-faint">Active</span>
              <Toggle on={selectedPreset.is_active} onChange={(v) => updatePreset({ is_active: v })} />
            </div>
          </div>
          <div className="mt-4 flex justify-end border-t border-border pt-4">
            <Button variant="danger" size="sm" onClick={deletePreset}>Delete preset</Button>
          </div>
        </div>
      )}

      <WidgetGrid
        items={gridItems}
        folders={folders}
        activeTab={widgetTab}
        mode={mode}
        onSelectCollection={(c) => setScreen({ kind: 'editor', collectionId: c.id })}
        onOpenBrowseHub={(hub) => {
          const collection = hub === 'genre' ? genresCollection : languagesCollection;
          if (!collection) {
            alert(`No "${hub === 'genre' ? 'Genres' : 'Languages'}" collection found to edit — create one from "All Widgets" first.`);
            return;
          }
          setScreen({ kind: 'editor', collectionId: collection.id });
        }}
        onAddWidget={handleAddWidget}
        onDeleteCard={handleDeleteCard}
        onReorderCard={handleReorderCard}
      />

      {mode === 'preset' && showAddPanel && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border-strong bg-surface p-4">
          <select
            value={addExistingId}
            onChange={(e) => setAddExistingId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="">Choose an existing widget…</option>
            {availableForPreset.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button size="sm" onClick={addExistingToPreset} disabled={!addExistingId || addingExisting}>
            {addingExisting ? 'Copying…' : '+ Add existing'}
          </Button>
          <span className="text-xs text-faint">or</span>
          <Button size="sm" variant="ghost" onClick={createAndAddToPreset}>+ Create new</Button>
          {widgetTab === 'home' && availableBrowseHubs.map((hub) => (
            <Button key={hub} size="sm" variant="ghost" onClick={() => addBrowseHubToPreset(hub)}>
              + Add "Browse by {hub === 'genre' ? 'Genre' : 'Language'}"
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setShowAddPanel(false)}>Cancel</Button>
        </div>
      )}
    </AppShell>
  );
}
