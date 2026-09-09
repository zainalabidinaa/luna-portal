// Read-only. Dumps the current "Languages" collection's folder tree exactly
// as stored (name, id, parent_folder_id, and attached folder_catalogs), so
// stray/misplaced folders can be spotted before any cleanup script touches
// anything. Nothing here writes to the database.
//
//   SUPABASE_SERVICE_ROLE_KEY=<key> node language-hub-audit.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hvfsntdyowapjxobtyli.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

async function main() {
  const { data: collections, error: cErr } = await sb.from('collections').select('*');
  if (cErr) throw cErr;
  const languages = collections.filter((c) => normalize(c.name) === 'languages');
  if (languages.length === 0) {
    console.log('No "Languages" collection found.');
    return;
  }
  if (languages.length > 1) {
    console.log(`WARNING: ${languages.length} collections named "Languages" found:`);
    for (const c of languages) console.log(`  ${c.id}  sort_order=${c.sort_order}`);
  }

  for (const collection of languages) {
    console.log(`\n=== Collection "${collection.name}" (${collection.id}) ===`);
    const { data: folders, error: fErr } = await sb
      .from('folders')
      .select('*')
      .eq('collection_id', collection.id)
      .order('sort_order');
    if (fErr) throw fErr;

    const { data: catalogs, error: catErr } = await sb
      .from('folder_catalogs')
      .select('*')
      .in('folder_id', folders.map((f) => f.id));
    if (catErr) throw catErr;

    const topLevel = folders.filter((f) => !f.parent_folder_id);
    const byParent = {};
    for (const f of folders) {
      if (f.parent_folder_id) {
        (byParent[f.parent_folder_id] ??= []).push(f);
      }
    }

    const printFolder = (f, indent) => {
      const cats = catalogs.filter((c) => c.folder_id === f.id);
      const catStr = cats.length ? cats.map((c) => `${c.catalog_id}(${c.media_type})`).join(', ') : '(no catalogs)';
      console.log(`${indent}${f.name}  [id=${f.id}]  ${catStr}`);
      for (const child of byParent[f.id] ?? []) {
        printFolder(child, indent + '  ');
      }
    };

    console.log(`${topLevel.length} top-level folder(s):`);
    for (const f of topLevel) printFolder(f, '  ');

    // Flag anything that's a child of something NOT in this collection's own
    // top-level set (shouldn't be possible given the query above, but this
    // also catches orphans: a parent_folder_id pointing at a folder that no
    // longer exists at all).
    const allIds = new Set(folders.map((f) => f.id));
    const orphans = folders.filter((f) => f.parent_folder_id && !allIds.has(f.parent_folder_id));
    if (orphans.length) {
      console.log(`\n  ORPHANS (parent_folder_id points outside this collection):`);
      for (const f of orphans) console.log(`    ${f.name}  [id=${f.id}]  parent_folder_id=${f.parent_folder_id}`);
    }
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
