# "Run setup now" Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user "Run setup" button to the portal's Users admin page that force re-runs `install_curated_setup()` for that user immediately, without requiring the admin to toggle `stream_addons_enabled`.

**Architecture:** The `admin-users` Supabase Edge Function's PATCH handler gains a new optional `runSetup: boolean` request field. When present and true, it resolves the user's first profile id (same lookup the existing streams branch already does) and calls the `install_curated_setup` RPC. The React `UsersPage` component gains a new button and a `runningSetup` loading-state map, following the exact pattern already used by `handleStreamsToggle`.

**Tech Stack:** Deno Edge Function (Supabase), React + TypeScript (Vite), no test harness exists for this admin surface today (no test files for `UsersPage.tsx`, `DeleteUserModal.tsx`, or `admin-users/index.ts`) — this plan follows that existing convention and verifies manually instead of writing new unit tests for these files.

---

### Task 1: Backend — accept and handle `runSetup` in the PATCH handler

**Files:**
- Modify: `supabase/functions/admin-users/index.ts:139-212`

- [ ] **Step 1: Read the current PATCH handler in full**

Run: `sed -n '139,212p' supabase/functions/admin-users/index.ts`

Confirm the current structure matches:
```ts
    if (req.method === 'PATCH') {
      const { userId, role, role_expires_at, stream_addons_enabled } = await req.json();
      if (!userId || (!role && stream_addons_enabled === undefined)) {
        return new Response(JSON.stringify({ error: 'userId and (role or stream_addons_enabled) are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // ... role validation, accounts upsert, profile lookup/insert ...
      // Re-provision immediately when the streams grant changed, rather than
      // waiting for the next cron sync — the admin flipping this switch
      // should be reflected the next time that user's app loads addons.
      if (stream_addons_enabled !== undefined && profileId) {
        const { error: rpcErr } = await supabaseAdmin.rpc('install_curated_setup', { p_profile_id: profileId });
        if (rpcErr) throw rpcErr;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
```

- [ ] **Step 2: Widen the request body destructure and the required-field check**

Replace:
```ts
      const { userId, role, role_expires_at, stream_addons_enabled } = await req.json();
      if (!userId || (!role && stream_addons_enabled === undefined)) {
        return new Response(JSON.stringify({ error: 'userId and (role or stream_addons_enabled) are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
```

With:
```ts
      const { userId, role, role_expires_at, stream_addons_enabled, runSetup } = await req.json();
      if (!userId || (!role && stream_addons_enabled === undefined && !runSetup)) {
        return new Response(JSON.stringify({ error: 'userId and (role, stream_addons_enabled, or runSetup) are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
```

- [ ] **Step 3: Trigger the RPC on `runSetup` too**

Find the re-provision block:
```ts
      // Re-provision immediately when the streams grant changed, rather than
      // waiting for the next cron sync — the admin flipping this switch
      // should be reflected the next time that user's app loads addons.
      if (stream_addons_enabled !== undefined && profileId) {
        const { error: rpcErr } = await supabaseAdmin.rpc('install_curated_setup', { p_profile_id: profileId });
        if (rpcErr) throw rpcErr;
      }
```

Replace with:
```ts
      // Re-provision immediately when the streams grant changed, rather than
      // waiting for the next cron sync — the admin flipping this switch
      // should be reflected the next time that user's app loads addons.
      // `runSetup` triggers the same RPC on demand, independent of any flag
      // change, so an admin can force a re-provision without touching state.
      if ((stream_addons_enabled !== undefined || runSetup) && profileId) {
        const { error: rpcErr } = await supabaseAdmin.rpc('install_curated_setup', { p_profile_id: profileId });
        if (rpcErr) throw rpcErr;
      }
```

- [ ] **Step 4: Verify profile lookup runs even when only `runSetup` is sent**

Read `supabase/functions/admin-users/index.ts` around the profile lookup/insert block (originally lines ~164-198) and confirm it does NOT gate on `role` or `stream_addons_enabled` being present — it should unconditionally look up (or insert) the first profile for `userId` whenever the PATCH handler runs. If it's already unconditional, no change needed. If you find it's gated (e.g. wrapped in an `if (role || stream_addons_enabled !== undefined)`), widen that condition to also include `|| runSetup`.

- [ ] **Step 5: Deploy the function**

Run: `cd supabase/functions/admin-users && supabase functions deploy admin-users`
Expected: deploy succeeds with no errors.

(If you don't have the Supabase CLI linked locally, skip this step and note it in your final report — the user will deploy manually.)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-users/index.ts
git commit -m "feat: add runSetup action to admin-users PATCH handler"
```

---

### Task 2: Frontend — "Run setup" button on the Users page

**Files:**
- Modify: `src/routes/admin/UsersPage.tsx`

- [ ] **Step 1: Add loading-state for the new action**

Find:
```ts
  const [changingExpiry, setChangingExpiry] = useState<string | null>(null);
```

Add directly after it:
```ts
  const [runningSetup, setRunningSetup] = useState<string | null>(null);
```

- [ ] **Step 2: Add the handler**

Find `handleStreamsToggle` (the whole function, including its leading comment):
```ts
  // Toggling this re-runs install_curated_setup() server-side immediately (see
  // the admin-users PATCH handler), so it takes effect the next time that
  // user's app loads addons — not on the next cron pass two days from now.
  async function handleStreamsToggle(userId: string, next: boolean) {
    setChangingStreams(userId);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/admin-users`, {
        method: 'PATCH',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId, stream_addons_enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, stream_addons_enabled: next } : u));
    } catch (e) {
      setError((e as Error).message || 'Failed to change streams access');
      setTimeout(() => setError(''), 4000);
    } finally {
      setChangingStreams(null);
    }
  }
```

Add a new function immediately after it:
```ts
  // Forces install_curated_setup() to re-run for this user right now,
  // independent of any role/streams change — for fixing a missing or stale
  // catalog without touching an unrelated flag.
  async function handleRunSetup(userId: string) {
    setRunningSetup(userId);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/admin-users`, {
        method: 'PATCH',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId, runSetup: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setError((e as Error).message || 'Failed to run setup');
      setTimeout(() => setError(''), 4000);
    } finally {
      setRunningSetup(null);
    }
  }
```

- [ ] **Step 3: Add the button to the row's action cell**

Find the last `<td>` in the row (the Delete button cell):
```tsx
                    <td className="px-4 py-3">
                      {/* Admin accounts can't be deleted from here at all — the
                          server rejects it too, but hiding the affordance keeps
                          the intent visible before the modal is even opened. */}
                      {u.role !== 'admin' && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(u)}>
                          Delete
                        </Button>
                      )}
                    </td>
```

Replace with (adds a "Run setup" button before Delete, in its own cell so the table header count still matches — see Step 4):
```tsx
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={runningSetup === u.user_id}
                        onClick={() => handleRunSetup(u.user_id)}
                      >
                        Run setup
                      </Button>
                    </td>
                    <td className="px-4 py-3">
                      {/* Admin accounts can't be deleted from here at all — the
                          server rejects it too, but hiding the affordance keeps
                          the intent visible before the modal is even opened. */}
                      {u.role !== 'admin' && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(u)}>
                          Delete
                        </Button>
                      )}
                    </td>
```

- [ ] **Step 4: Add a matching header cell**

The `<thead>` row already has two trailing empty `<th>` cells for the role-select and delete columns:
```tsx
                  <th className="px-4 py-3" />
                  <th className="px-4 py-3" />
```

Add one more so there are three, matching the three trailing `<td>`s (role select, run setup, delete):
```tsx
                  <th className="px-4 py-3" />
                  <th className="px-4 py-3" />
                  <th className="px-4 py-3" />
```

- [ ] **Step 5: Typecheck**

Run: `cd /Users/zain/projects/Moonlit/moonlit-portal && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification in the browser**

1. Run: `npm run dev` (from `/Users/zain/projects/Moonlit/moonlit-portal`)
2. Open the portal, sign in as an admin, navigate to the Users page.
3. Confirm each row now shows a "Run setup" button between the role dropdown and Delete, and the header row has three trailing blank `<th>`s aligning with the three action columns.
4. Click "Run setup" for a test user (not a real production user) and confirm:
   - The button shows the loading spinner and is disabled while in flight.
   - It returns to normal without a persistent error banner on success.
   - Network tab shows a PATCH to `/admin-users` with body `{"userId":"...","runSetup":true}` returning `200 {"success":true}`.
5. Temporarily break auth (e.g. sign out) or simulate a failure to confirm the error banner appears and clears after ~4s. (Optional — skip if impractical to simulate.)

- [ ] **Step 7: Commit**

```bash
git add src/routes/admin/UsersPage.tsx
git commit -m "feat: add Run setup button to Users admin page"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the backend `runSetup` field spec'd in the design doc; Task 2 covers the frontend button, loading state, and error-banner reuse. Confirmation-modal and bulk-action are explicitly out of scope per the spec — not included here.
- **No test harness exists** for `UsersPage.tsx` or `admin-users/index.ts` in this repo (verified: no matching `.test.ts(x)` files). This plan does not fabricate a TDD flow for files with no existing test convention — verification is manual (typecheck + browser check + network inspection), matching how `handleDeleteUser` and `handleStreamsToggle` were originally built.
- **Type consistency:** `runSetup` name matches exactly between backend (`req.json()` destructure) and frontend (fetch body) in both tasks.
