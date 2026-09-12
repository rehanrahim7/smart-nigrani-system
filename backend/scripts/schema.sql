-- ===========================================================================
-- Smart Nigrani System / Smart Nigrani System — optional Supabase (PostgreSQL) schema
-- ===========================================================================
--
-- WHAT THIS IS
--   The API does NOT need Supabase. By default (DATA_BACKEND=local) it serves
--   projects from data/projects.json and keeps users and work logs in SQLite,
--   with no network at all. This file exists only for the optional mirror the
--   team's original code used, so that path keeps working.
--
-- HOW TO USE IT
--   1. Open your Supabase project -> SQL Editor -> New query.
--   2. Paste this whole file and press Run. It is safe to run more than once:
--      every statement uses IF NOT EXISTS.
--   3. Put SUPABASE_URL and SUPABASE_KEY in backend/.env.
--   4. Load the data:  python scripts/sync_supabase.py
--      (add --dry-run first to see what it would send)
--   5. Set DATA_BACKEND=supabase in .env if you want the API to mirror writes.
--
-- COLUMN NAMING
--   projects.json uses camelCase keys (districtKey, riskScore, ...). Postgres
--   folds unquoted identifiers to lowercase, so columns here are snake_case
--   and scripts/sync_supabase.py does the translation in one place.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- projects — one row per record in data/projects.json (4,807 rows).
-- Read-only for the API; refreshed by re-running scripts/sync_supabase.py.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    -- The MPLADS work id, e.g. "WS/MP18110/2024-2025/167291". Unsanctioned
    -- recommendations carry no work id, so prepare_data.py gives them a
    -- synthetic "REC-00042" instead — hence text, not a number.
    id                  text PRIMARY KEY,
    anon_id             text,
    name                text,
    category            text,
    state               text,
    district            text,
    district_key        text,
    constituency        text,
    agency              text,
    mp                  text,
    status              text,

    -- false = a recommendation that was never sanctioned.
    sanctioned          boolean,

    -- Rupee amounts are whole rupees, but MPLADS crore-scale figures overflow
    -- a 32-bit integer, so bigint everywhere money is stored.
    budget              bigint,
    sanction_amount     bigint,
    recommended_amount  bigint,
    total_paid          bigint,
    payment_count       integer,

    -- paid / sanctioned. Can exceed 1.0, which is itself a review signal, so
    -- there is deliberately no CHECK constraint clamping it.
    payment_ratio       numeric,

    recommended_date    date,
    sanction_date       date,
    completion_date     date,

    -- District-level centroid plus a deterministic jitter, NOT a surveyed work
    -- site. Nullable because a few agency strings name no mappable district.
    lat                 double precision,
    lon                 double precision,

    -- 0-100 composite from the four detectors; risk_label is its band
    -- ("Critical Review" / "High Review" / "Medium Review" / "Routine").
    risk_score          numeric,
    risk_label          text,
    primary_reason      text,
    active_signals      integer,

    -- Detector detail kept as jsonb rather than exploded into columns: the UI
    -- renders it as a whole, and the detector set may grow between rounds.
    scores              jsonb,
    signals             jsonb,
    peer                jsonb,
    duplicate_match     jsonb
);

-- The dashboard's four hot filters. Each is a plain equality lookup over a
-- low-cardinality column, so a simple btree index is the right tool.
CREATE INDEX IF NOT EXISTS projects_risk_label_idx   ON projects (risk_label);
CREATE INDEX IF NOT EXISTS projects_district_key_idx ON projects (district_key);
CREATE INDEX IF NOT EXISTS projects_mp_idx           ON projects (mp);
CREATE INDEX IF NOT EXISTS projects_constituency_idx ON projects (constituency);


-- ---------------------------------------------------------------------------
-- users — demo login accounts, mirrored from the SQLite users table.
-- Columns match app/store.py exactly so rows can move either way unchanged.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            text PRIMARY KEY,
    username      text NOT NULL UNIQUE,

    -- Salted hash produced by app/security.py. Never a plaintext password,
    -- not even for the shared demo password.
    password_hash text NOT NULL,
    name          text NOT NULL,

    -- 'mp' (sees their own recommended works) or 'vendor' (sees their own
    -- district). Left unconstrained so a new role does not need a migration
    -- mid-hackathon.
    role          text NOT NULL,

    -- Scope fields: which rows this account may see. Only the one that matches
    -- the role is filled in, so all three are nullable.
    mp_name       text,
    district_key  text,
    constituency  text,

    organisation  text,

    -- Stored as text, matching SQLite, so the two backends agree byte for byte.
    created_at    text NOT NULL
);


-- ---------------------------------------------------------------------------
-- work_logs — progress entries a vendor adds against a project.
-- The only table the running app writes to in normal use.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_logs (
    id              text PRIMARY KEY,

    -- ON DELETE CASCADE so re-importing the project set can never leave logs
    -- pointing at a project id that no longer exists.
    project_id      text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,

    work            text NOT NULL,
    cost            bigint NOT NULL,
    work_date       date NOT NULL,
    note            text,

    -- The username, and the display name captured at write time so the log
    -- still reads correctly if the account is later renamed.
    created_by      text NOT NULL,
    created_by_name text NOT NULL,
    created_at      text NOT NULL
);

-- Every read of this table is "the entries for one project, oldest first",
-- which this composite index answers without a sort.
CREATE INDEX IF NOT EXISTS work_logs_project_idx ON work_logs (project_id, work_date);


-- ===========================================================================
-- ROW LEVEL SECURITY — READ THIS BEFORE ANY REAL DEPLOYMENT
-- ===========================================================================
--
-- The statements below are COMMENTED OUT ON PURPOSE, and that is a demo
-- shortcut, not a recommendation.
--
-- How access control works today:
--   All of it lives in the FastAPI layer. app/deps.py resolves the session
--   token to a user, and store.ProjectIndex.scoped() narrows the visible rows
--   by role (MP -> own recommendations, vendor -> own district). The
--   database itself enforces nothing.
--
-- Why that is acceptable only for the demo:
--   The sync script and the API talk to Supabase with a single key. Nothing
--   in the database distinguishes one caller from another, so ANY holder of
--   that key can read and write every row. That is survivable while the data
--   is a public MPLADS extract and the accounts share one printed password.
--
-- Why it is NOT acceptable in production:
--   If the key ever leaks — committed to git, shipped inside a frontend
--   bundle, pasted in a chat — the whole table is exposed, and the API-side
--   checks above are simply bypassed. RLS is the backstop that makes a leaked
--   anon key boring instead of catastrophic.
--
-- Before deploying for real:
--   1. Enable RLS on all three tables (below). With RLS on and no policy,
--      every request is denied — so add the policies in the same change or
--      the app stops working.
--   2. Move authentication to Supabase Auth so auth.uid() is meaningful, and
--      write policies against it instead of trusting the API.
--   3. Keep the service_role key server-side only. It bypasses RLS by design.
--      The frontend must only ever see the anon key.
--
-- Sketch of the intended end state:
--
-- ALTER TABLE projects  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE users     ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
--
-- -- Projects are public MPLADS records: readable by any signed-in user,
-- -- writable only by the server-side importer (service_role bypasses RLS).
-- CREATE POLICY projects_read ON projects
--     FOR SELECT TO authenticated
--     USING (true);
--
-- -- A user may read only their own account row. Nobody reads anyone else's,
-- -- and password_hash never leaves the server regardless.
-- CREATE POLICY users_read_self ON users
--     FOR SELECT TO authenticated
--     USING (id = auth.uid()::text);
--
-- -- Work logs are readable by any signed-in user (the dashboards aggregate
-- -- them), but a vendor may insert only as themselves and delete only their
-- -- own entry — mirroring store.delete_work()'s owner check.
-- CREATE POLICY work_logs_read ON work_logs
--     FOR SELECT TO authenticated
--     USING (true);
--
-- CREATE POLICY work_logs_insert_own ON work_logs
--     FOR INSERT TO authenticated
--     WITH CHECK (created_by = auth.jwt() ->> 'username');
--
-- CREATE POLICY work_logs_delete_own ON work_logs
--     FOR DELETE TO authenticated
--     USING (created_by = auth.jwt() ->> 'username');
--
-- ===========================================================================
