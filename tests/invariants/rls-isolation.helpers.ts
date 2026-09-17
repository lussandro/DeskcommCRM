/**
 * Fixture constants + seed helper shared by rls-isolation.test.ts (G1-02) and
 * empresas.test.ts (migration 0260). Extracted mechanically — same values,
 * same SQL — so both files seed identical orgs/users without duplicating the
 * fixture. `sql`/`countAs` stay in gov-helpers.ts; this file only owns the
 * org/user identity and the seed builder.
 */

// Fixed UUIDs make the seed idempotent (on conflict do nothing).
export const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
export const USER_A = "aaaaaaaa-1111-4000-8000-000000000001";
export const USER_B = "bbbbbbbb-1111-4000-8000-000000000002";

/**
 * Returns SQL (does not execute it) that seeds one org + one user + one
 * channel session. Callers compose with `sql(seedOrg(...) + seedOrg(...))`.
 */
export function seedOrg(org: string, user: string, sess: string, tag: string): string {
  // No real PII: synthetic emails/names only (LGPD).
  return `
    insert into auth.users (id, email) values ('${user}', 'rls-${tag}@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${org}', 'rls-inv-${tag}', 'RLS Invariant ${tag}', 'RLS ${tag}')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${user}', '${org}', 'agent', now())
      on conflict do nothing;
    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
      values ('${sess}', '${org}', 'rls-inv-${tag}', '\\x00'::bytea)
      on conflict (id) do nothing;
  `;
}
