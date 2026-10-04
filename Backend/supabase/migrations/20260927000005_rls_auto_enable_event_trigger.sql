-- ============================================================================
-- 20260927000005_rls_auto_enable_event_trigger.sql
--
-- RECONSTRUCTED reconciliation migration.
--
-- This migration version exists in the REMOTE database's migration history but
-- its source file was never committed to this repo (applied out-of-band during
-- development). Its effect was captured by dumping the remote schema on
-- 2026-09-27 and reconstructed here so local history matches remote and
-- `supabase db reset` reproduces production.
--
-- Content: a DDL event trigger that auto-enables Row Level Security on any newly
-- created table in the `public` schema (defense-in-depth so a new table is never
-- accidentally left world-readable). The event trigger itself is a
-- database-global object that `supabase db dump --schema public` does not emit;
-- it is reconstructed from the captured function body's command-tag filter.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP EVENT TRIGGER IF EXISTS.
-- Against the hosted DB this version is already applied, so `db push` skips it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
    RETURNS event_trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

-- Rebind the event trigger to the (re)created function. DB-global object, so it
-- is dropped/recreated rather than CREATE OR REPLACE'd. Command-tag filter is
-- taken from the captured function body (CREATE TABLE / CREATE TABLE AS / SELECT INTO).
DROP EVENT TRIGGER IF EXISTS rls_auto_enable;

CREATE EVENT TRIGGER rls_auto_enable
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
