-- Aslan Project Map · 030 · Workspace 4-layer (Project container > Hub > Node)
-- Corresponds to Firestore subcollections under each account:
--   accounts/{accountId}/workspaceProjects/{projectId}/
--     ├── hubs/{hubId}
--     └── nodes/{nodeId}        (sibling with hubs, many-to-many via hub_ids[])
--
-- See `docs/DATA-MODEL.md §3` — "workspaceProjects", "hubs", "nodes".
--
-- The 000 `projects` table is the **legacy flat global** store and stays until
-- migration is complete. workspace_hubs + workspace_nodes are the successors.

-- ── container: workspaceProjects ─────────────────────────────────────────
create table if not exists workspace_projects (
  id text not null,                                        -- slug (e.g. "general", "narnia")
  account_id text not null references accounts(id) on delete cascade,
  name text not null,
  description text,
  is_public boolean,
  -- Firestore field is `order` (reserved word in SQL), renamed to display_order.
  display_order integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, id)
);

create index if not exists idx_workspace_projects_account_order
  on workspace_projects(account_id, display_order nulls last, created_at desc);

-- ── hubs ──────────────────────────────────────────────────────────────────
-- Hubs carry the same content shape as legacy `projects` rows where isHub=true.
-- Position fields are nullable because layout can be recomputed client-side
-- from force simulation rather than stored per-node.
create table if not exists workspace_hubs (
  id text not null,                                        -- slug, equals hubId
  account_id text not null,
  workspace_project_id text not null,
  name text not null,
  name_en text,
  category_id text references categories(id) on delete restrict,
  status_id text references statuses(id) on delete restrict,
  description text not null default '',
  detail_markdown text,
  tags text[] not null default '{}',
  stack text[] not null default '{}',
  links jsonb not null default '[]'::jsonb,
  owner text,
  icon text,
  screenshots text[] not null default '{}',
  timeline jsonb not null default '{}'::jsonb,
  progress integer check (progress is null or (progress between 0 and 100)),
  position_x double precision,
  position_y double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, workspace_project_id, id),
  foreign key (account_id, workspace_project_id)
    references workspace_projects(account_id, id)
    on delete cascade
);

create index if not exists idx_workspace_hubs_container
  on workspace_hubs(account_id, workspace_project_id);
create index if not exists idx_workspace_hubs_category
  on workspace_hubs(category_id);
create index if not exists idx_workspace_hubs_status
  on workspace_hubs(status_id);

-- ── nodes (sibling with hubs, linked via junction) ────────────────────────
create table if not exists workspace_nodes (
  id text not null,                                        -- slug, equals nodeId
  account_id text not null,
  workspace_project_id text not null,
  name text not null,
  name_en text,
  category_id text references categories(id) on delete restrict,
  status_id text references statuses(id) on delete restrict,
  description text not null default '',
  detail_markdown text,
  tags text[] not null default '{}',
  stack text[] not null default '{}',
  links jsonb not null default '[]'::jsonb,
  owner text,
  icon text,
  screenshots text[] not null default '{}',
  timeline jsonb not null default '{}'::jsonb,
  progress integer check (progress is null or (progress between 0 and 100)),
  position_x double precision,
  position_y double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, workspace_project_id, id),
  foreign key (account_id, workspace_project_id)
    references workspace_projects(account_id, id)
    on delete cascade
);

create index if not exists idx_workspace_nodes_container
  on workspace_nodes(account_id, workspace_project_id);
create index if not exists idx_workspace_nodes_category
  on workspace_nodes(category_id);
create index if not exists idx_workspace_nodes_status
  on workspace_nodes(status_id);

-- node → hub membership (Firestore `hubIds[]` flattened into junction).
-- A node may belong to 0..N hubs (0 = orphan/standalone service).
create table if not exists workspace_node_hubs (
  account_id text not null,
  workspace_project_id text not null,
  node_id text not null,
  hub_id text not null,
  created_at timestamptz not null default now(),
  primary key (account_id, workspace_project_id, node_id, hub_id),
  foreign key (account_id, workspace_project_id, node_id)
    references workspace_nodes(account_id, workspace_project_id, id)
    on delete cascade,
  foreign key (account_id, workspace_project_id, hub_id)
    references workspace_hubs(account_id, workspace_project_id, id)
    on delete cascade
);

create index if not exists idx_workspace_node_hubs_hub
  on workspace_node_hubs(account_id, workspace_project_id, hub_id);

-- Cross-container dependency edges for hubs/nodes. Stored by slug rather than
-- FK so cross-container refs (e.g. Narnia node → Aslan IAM hub) don't need
-- multi-step joins. Target existence is validated at app layer.
create table if not exists workspace_hub_dependencies (
  account_id text not null,
  workspace_project_id text not null,
  hub_id text not null,
  depends_on_slug text not null,
  created_at timestamptz not null default now(),
  primary key (account_id, workspace_project_id, hub_id, depends_on_slug),
  foreign key (account_id, workspace_project_id, hub_id)
    references workspace_hubs(account_id, workspace_project_id, id)
    on delete cascade,
  check (hub_id <> depends_on_slug)
);

create table if not exists workspace_node_dependencies (
  account_id text not null,
  workspace_project_id text not null,
  node_id text not null,
  depends_on_slug text not null,
  created_at timestamptz not null default now(),
  primary key (account_id, workspace_project_id, node_id, depends_on_slug),
  foreign key (account_id, workspace_project_id, node_id)
    references workspace_nodes(account_id, workspace_project_id, id)
    on delete cascade,
  check (node_id <> depends_on_slug)
);
