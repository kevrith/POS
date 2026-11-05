-- Close the Supabase Data API off from this database.
--
-- Supabase serves an auto-generated PostgREST API over the `public` schema using
-- the `anon` and `authenticated` roles, and its default privileges grant those
-- roles ALL on every table created in `public`. Prisma creates every table there,
-- so all of them were readable AND writable by anyone holding the project's anon
-- key — which Supabase treats as publishable by design. That included
-- User.passwordHash and User.pinHash, Customer phone numbers and KRA PINs, and
-- the AES-encrypted M-Pesa/eTIMS credentials on Business. TRUNCATE was granted too.
--
-- This application never uses the Data API. It talks to Postgres directly through
-- Prisma, so the API is pure attack surface. Three layers, because any one of them
-- alone leaves a hole:
--
--   1. Stop FUTURE tables inheriting the grants. Without this the next migration
--      that creates a table reopens the exposure.
--   2. Remove the grants that already exist.
--   3. Enable RLS everywhere as a backstop, which is also what clears Supabase's
--      `rls_disabled_in_public` and `sensitive_columns_exposed` advisories.
--
-- Safe for the application: the migration role owns these tables and (on Supabase)
-- holds BYPASSRLS, so it is unaffected on both counts. `anon` and `authenticated`
-- have neither, so with no policies defined they are denied outright.
--
-- `service_role` is deliberately left alone. It is a secret key, it also has
-- BYPASSRLS, and revoking it can break Supabase's own tooling.
--
-- PORTABLE: `anon` and `authenticated` exist only on Supabase. On a plain
-- PostgreSQL instance — CI, a local dev database, a self-hosted deployment — the
-- grant work is skipped rather than failing the migration. Step 3 still runs, so
-- every environment ends up with the same RLS posture.

-- ── 1 + 2. Supabase API roles, only where they exist ────────────────────────
DO $$
DECLARE
  api_roles text[] := ARRAY[]::text[];
  role_list text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    api_roles := array_append(api_roles, 'anon');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    api_roles := array_append(api_roles, 'authenticated');
  END IF;

  IF cardinality(api_roles) = 0 THEN
    RAISE NOTICE 'No Supabase API roles present — not a Supabase database, skipping grant revocation.';
    RETURN;
  END IF;

  role_list := array_to_string(api_roles, ', ');

  -- Future objects created by the current role.
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %s', role_list);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %s', role_list);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %s', role_list);

  -- Supabase also sets defaults as `supabase_admin`. We may not be a member of
  -- that role, in which case this is not ours to change — skip rather than fail.
  BEGIN
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM %s', role_list);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %s', role_list);
  EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
    RAISE NOTICE 'Skipping supabase_admin default privileges (not a member).';
  END;

  -- Objects that already exist.
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %s', role_list);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %s', role_list);
  EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %s', role_list);

  RAISE NOTICE 'Revoked public-schema access from: %', role_list;
END $$;

-- ── 3. RLS backstop on every table we own ───────────────────────────────────
-- No policies are created, so RLS denies every role that does not bypass it.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;
