-- Aslan Project Map · 000 · Core public-product tables
-- Relational contract snapshot for future PostgreSQL / Prisma migration.
-- Current runtime canonical store remains Firestore.
--
-- Scope: v1 public product (flat `projects` + taxonomy). Single-tenant shape
-- kept intentionally for the global catalog (`projects/{slug}`). Multi-tenant
-- schema (`accounts`, `workspace_projects` 4-layer) lives in 020/030.
--
-- Order of apply: 000 → 010 → 020 → 030 → 040 → 050.

create extension if not exists citext;

create table if not exists categories (
  id text primary key,
  label text not null,
  label_en text,
  sort_order integer not null,
  position_x double precision not null,
  position_y double precision not null,
  size_width double precision not null,
  size_height double precision not null,
  radius double precision not null,
  border_style text not null,
  side_label_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists statuses (
  id text primary key,
  label text not null,
  label_en text,
  sort_order integer not null,
  dot_color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  slug text primary key,
  name text not null,
  name_en text,
  category_id text not null references categories(id),
  status_id text not null references statuses(id),
  description text not null,
  detail_markdown text,
  tags text[] not null default '{}',
  stack text[] not null default '{}',
  links jsonb not null default '[]'::jsonb,
  owner text,
  icon text,
  screenshots text[] not null default '{}',
  timeline jsonb not null default '{}'::jsonb,
  progress integer,
  is_hub boolean not null default false,
  position_x double precision not null,
  position_y double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_dependencies (
  project_slug text not null references projects(slug) on delete cascade,
  depends_on_slug text not null references projects(slug) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (project_slug, depends_on_slug),
  check (project_slug <> depends_on_slug)
);

create index if not exists idx_projects_category_id on projects(category_id);
create index if not exists idx_projects_status_id on projects(status_id);
create index if not exists idx_project_dependencies_depends_on_slug on project_dependencies(depends_on_slug);

create table if not exists admins (
  email citext primary key,
  note text,
  added_at timestamptz not null default now()
);

create table if not exists site_meta (
  id text primary key default 'site',
  title text,
  description text,
  last_updated timestamptz,
  view_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id = 'site')
);
