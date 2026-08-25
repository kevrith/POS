-- Close the Supabase Data API off from this database.
--
-- Supabase serves an auto-generated PostgREST API over the `public` schema using
-- the `anon` and `authenticated` roles, and its default privileges grant those
-- roles ALL on every table created in `public`. Prisma creates every table there,
-- so all 152 of them were readable AND writable by anyone holding the project's
-- anon key — which Supabase treats as publishable by design. That included
-- User.passwordHash and User.pinHash, Customer phone numbers and KRA PINs, and
-- the AES-encrypted M-Pesa/eTIMS credentials on Business. TRUNCATE was granted too.
--
-- This application never uses the Data API. It talks to Postgres directly through
-- Prisma as the `postgres` role, so the API is pure attack surface. Three layers,
-- because any one of them alone leaves a hole:
--
--   1. Stop FUTURE tables inheriting the grants. Without this the next migration
--      that creates a table reopens the exposure.
--   2. Remove the grants that already exist.
--   3. Enable RLS everywhere as a backstop, which is also what clears Supabase's
--      `rls_disabled_in_public` and `sensitive_columns_exposed` advisories.
--
-- Safe for the application: `postgres` owns all of these tables AND has BYPASSRLS,
-- so it is unaffected on both counts. `anon` and `authenticated` have neither, so
-- with no policies defined they are denied outright.
--
-- `service_role` is deliberately left alone. It is a secret key, it also has
-- BYPASSRLS, and revoking it can break Supabase's own tooling.

-- ── 1. Future tables ────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Supabase also sets defaults as `supabase_admin`. We may not be a member of that
-- role, in which case this is not ours to change — skip rather than fail the migration.
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM anon, authenticated;
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'skipping supabase_admin default privileges (not a member)';
END $$;

-- ── 2. Existing objects ─────────────────────────────────────────────────────
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

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
