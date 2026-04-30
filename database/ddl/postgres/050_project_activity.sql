-- Aslan Project Map · 050 · Project activity audit log
-- Firestore collection: `projectActivity/{id}` (global) — tracks who changed
-- which project when. Used by /admin/insights operational panel.
--
-- `account_id` is nullable so global public-catalog projects (no account
-- scope) can emit activity under `account_id IS NULL`. Account-scoped spaces
-- emit their own accountId string.

create extension if not exists citext;

create table if not exists project_activity (
  id text primary key,
  action text not null check (
    action in ('project.created', 'project.updated', 'project.deleted')
  ),
  project_slug text not null,
  -- Snapshot of the name at the time of activity; kept even after delete so the
  -- UI can still render "deleted <name>" without a join.
  project_name text not null,
  actor_email citext,
  actor_name text,
  account_id text references accounts(id) on delete set null,
  summary text,                                            -- e.g. "status: developing → live"
  created_at timestamptz not null default now()
);

-- Timeline queries: by project, by account.
create index if not exists idx_project_activity_project
  on project_activity(project_slug, created_at desc);
create index if not exists idx_project_activity_account
  on project_activity(account_id, created_at desc) where account_id is not null;
create index if not exists idx_project_activity_created_at
  on project_activity(created_at desc);
