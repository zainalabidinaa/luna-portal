import { useState } from 'react';
import { useLanguageHubRails } from '../../hooks/useLanguageHubRails';
import type { LanguageHubRail } from '../../types';

/** Folder name -> ISO code, mirroring the tiles MacHomeView opens
 *  MacLanguageHubView with (see MacHomeView.swift's language tile list). */
export const LANGUAGE_ISO_BY_FOLDER_NAME: Record<string, string> = {
  korean: 'ko', japanese: 'ja', spanish: 'es', french: 'fr', chinese: 'zh',
  indian: 'hi', german: 'de', italian: 'it', portuguese: 'pt', turkish: 'tr',
  swedish: 'sv', danish: 'da', norwegian: 'no', russian: 'ru', polish: 'pl',
  thai: 'th', dutch: 'nl', arabic: 'ar',
};

function emptyDraft(tier: 'general' | 'featured'): Omit<LanguageHubRail, 'id'> {
  return { tier, iso: null, title: '', kind: 'movie', filter_type: 'language', filter_value: '', params: {}, sort_order: 0 };
}

export function LanguageHubRailsEditor({ iso, languageName }: { iso: string; languageName: string }) {
  const { rows, loading, addRow, updateRow, deleteRow } = useLanguageHubRails(iso);
  const [adding, setAdding] = useState<'general' | 'featured' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (loading) return null;

  const sharedGeneral = rows.filter((r) => r.tier === 'general' && r.iso === null);
  const ownGeneral = rows.filter((r) => r.tier === 'general' && r.iso === iso);
  const featured = rows.filter((r) => r.tier === 'featured' && r.iso === iso);
  const generalRows = ownGeneral.length > 0 ? ownGeneral : sharedGeneral;
  const usingSharedGeneral = ownGeneral.length === 0;

  async function handleSave(draft: Omit<LanguageHubRail, 'id'>, id: string | null) {
    if (!draft.title.trim()) return;
    if (id) await updateRow(id, draft);
    else await addRow({ ...draft, iso });
    setAdding(null);
    setEditingId(null);
  }

  return (
    <div className="mt-6 border-t border-dashed border-border-strong pt-5">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-faint">
        TMDB Discover Rails — {languageName}
      </p>
      <p className="mb-3 text-[11.5px] text-faint">
        Client-fetched rails (not addon catalogs) — powers the Language Hub screen in the Mac/iOS/tvOS apps directly via TMDB.
      </p>

      <RailGroup
        title="General"
        hint={usingSharedGeneral ? 'Using the shared default (not overridden for this language)' : 'Overrides the shared default for this language'}
        rows={generalRows}
        tier="general"
        editingId={editingId}
        adding={adding === 'general'}
        onStartAdd={() => setAdding('general')}
        onCancelAdd={() => setAdding(null)}
        onEdit={setEditingId}
        onCancelEdit={() => setEditingId(null)}
        onDelete={(row) => { if (confirm(`Delete "${row.title}"?`)) deleteRow(row.id); }}
        onSave={handleSave}
        disableRowEdit={usingSharedGeneral}
      />

      <div className="mt-5">
        <RailGroup
          title="Featured"
          hint="Additional rails shown only for this language"
          rows={featured}
          tier="featured"
          editingId={editingId}
          adding={adding === 'featured'}
          onStartAdd={() => setAdding('featured')}
          onCancelAdd={() => setAdding(null)}
          onEdit={setEditingId}
          onCancelEdit={() => setEditingId(null)}
          onDelete={(row) => { if (confirm(`Delete "${row.title}"?`)) deleteRow(row.id); }}
          onSave={handleSave}
          disableRowEdit={false}
        />
      </div>
    </div>
  );
}

function RailGroup({
  title, hint, rows, tier, editingId, adding, onStartAdd, onCancelAdd, onEdit, onCancelEdit, onDelete, onSave, disableRowEdit,
}: {
  title: string;
  hint: string;
  rows: LanguageHubRail[];
  tier: 'general' | 'featured';
  editingId: string | null;
  adding: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (row: LanguageHubRail) => void;
  onSave: (draft: Omit<LanguageHubRail, 'id'>, id: string | null) => void;
  disableRowEdit: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold text-text">{title}</span>
        <span className="text-[11px] text-faint">{hint}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) =>
          editingId === row.id ? (
            <RailForm key={row.id} initial={row} onCancel={onCancelEdit} onSave={(d) => onSave(d, row.id)} />
          ) : (
            <RailRow key={row.id} row={row} onEdit={disableRowEdit ? undefined : () => onEdit(row.id)} onDelete={() => onDelete(row)} />
          )
        )}
        {rows.length === 0 && <p className="text-[12.5px] text-faint">No rails.</p>}
      </div>

      {adding ? (
        <div className="mt-2">
          <RailForm initial={emptyDraft(tier)} onCancel={onCancelAdd} onSave={(d) => onSave(d, null)} />
        </div>
      ) : (
        <button
          onClick={onStartAdd}
          className="mt-2 rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          + Add rail
        </button>
      )}
    </div>
  );
}

function RailRow({ row, onEdit, onDelete }: { row: LanguageHubRail; onEdit?: () => void; onDelete: () => void }) {
  const paramsSummary = Object.entries(row.params).map(([k, v]) => `${k}=${v}`).join('  ·  ');
  const filterSummary = row.filter_type === 'country' ? `country:${row.filter_value}` : (row.filter_value ? `language:${row.filter_value}` : 'this language');
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5">
      <span className="rounded border border-cyan-500/30 px-1.5 py-0.5 font-mono text-[9px] text-cyan-400">{row.kind}</span>
      <span className="flex-1 truncate text-[13px] text-text">{row.title}</span>
      <span className="hidden truncate font-mono text-[10.5px] text-faint sm:inline">{filterSummary}</span>
      <span className="hidden truncate font-mono text-[10.5px] text-faint md:inline">{paramsSummary}</span>
      {onEdit && <button onClick={onEdit} className="text-[11px] text-faint hover:text-accent">Edit</button>}
      <button onClick={onDelete} className="text-faint hover:text-red-400">×</button>
    </div>
  );
}

function RailForm({
  initial, onCancel, onSave,
}: {
  initial: Omit<LanguageHubRail, 'id'> | LanguageHubRail;
  onCancel: () => void;
  onSave: (draft: Omit<LanguageHubRail, 'id'>) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [kind, setKind] = useState(initial.kind);
  const [filterType, setFilterType] = useState(initial.filter_type);
  const [filterValue, setFilterValue] = useState(initial.filter_value);
  const [paramsText, setParamsText] = useState(
    Object.entries(initial.params).map(([k, v]) => `${k}=${v}`).join(', ')
  );

  function parseParams(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of text.split(',')) {
      const [k, ...rest] = part.split('=');
      const key = k?.trim();
      const value = rest.join('=').trim();
      if (key && value) out[key] = value;
    }
    return out;
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-strong bg-surface p-3.5">
      <div className="flex flex-wrap gap-2">
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rail title, e.g. “K-Drama”"
          className="min-w-[160px] flex-1 rounded-lg border border-border bg-bg2 px-2.5 py-1.5 text-[12.5px] text-text outline-none focus:border-accent"
        />
        <select value={kind} onChange={(e) => setKind(e.target.value as LanguageHubRail['kind'])}
          className="rounded-lg border border-border bg-bg2 px-2.5 py-1.5 text-[12.5px] text-text outline-none focus:border-accent">
          <option value="movie">Movie</option>
          <option value="tv">TV</option>
          <option value="both">Both</option>
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as LanguageHubRail['filter_type'])}
          className="rounded-lg border border-border bg-bg2 px-2.5 py-1.5 text-[12.5px] text-text outline-none focus:border-accent">
          <option value="language">Language</option>
          <option value="country">Country</option>
        </select>
        <input
          value={filterValue} onChange={(e) => setFilterValue(e.target.value)}
          placeholder={filterType === 'country' ? 'e.g. EG,LB,SY' : 'blank = this language'}
          className="w-40 rounded-lg border border-border bg-bg2 px-2.5 py-1.5 font-mono text-[11.5px] text-text outline-none focus:border-accent"
        />
      </div>
      <input
        value={paramsText} onChange={(e) => setParamsText(e.target.value)}
        placeholder="TMDB discover params, e.g. with_genres=18, sort_by=popularity.desc, vote_count.gte=20"
        className="rounded-lg border border-border bg-bg2 px-2.5 py-1.5 font-mono text-[11.5px] text-text outline-none focus:border-accent"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-border-strong px-3 py-1.5 text-[12px] text-muted hover:text-text">Cancel</button>
        <button
          onClick={() => onSave({ ...initial, title: title.trim(), kind, filter_type: filterType, filter_value: filterValue.trim(), params: parseParams(paramsText) })}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-[#160a04] hover:bg-accent-2"
        >
          Save
        </button>
      </div>
    </div>
  );
}
