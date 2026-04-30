-- Aslan Project Map · 010 · Knowledge subsystem v2
-- Relational contract snapshot for future PostgreSQL / Prisma migration.
-- Current runtime canonical store remains Firestore + Storage + Functions.
--
-- Field-level contract mirrors `docs/DATA-MODEL.md §4`. Firestore document
-- ID becomes PRIMARY KEY `id text`. camelCase Firestore fields are mapped
-- to snake_case columns.

create extension if not exists citext;

-- ── documents ─────────────────────────────────────────────────────────────
create table if not exists knowledge_documents (
  id text primary key,
  title text not null,
  kind text not null,
  project_ids text[] not null default '{}',
  source_type text not null check (source_type in ('upload', 'manual', 'import')),
  current_version_id text not null,
  format_score double precision,
  status text not null check (
    status in ('draft', 'ready', 'processing', 'reviewing', 'published', 'error')
  ),
  latest_job_status text,
  created_by citext not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_document_versions (
  id text primary key,
  document_id text not null references knowledge_documents(id) on delete cascade,
  title text not null,
  kind text not null,
  project_ids text[] not null default '{}',
  frontmatter jsonb not null default '{}'::jsonb,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  hash text not null,
  created_by citext not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_versions_document_id
  on knowledge_document_versions(document_id, created_at desc);

-- FK document → current version (deferrable to allow bootstrap on insert)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_knowledge_documents_current_version'
  ) then
    alter table knowledge_documents
      add constraint fk_knowledge_documents_current_version
      foreign key (current_version_id) references knowledge_document_versions(id)
      deferrable initially deferred;
  end if;
end $$;

-- ── chunks · evidence ─────────────────────────────────────────────────────
create table if not exists knowledge_document_chunks (
  id text primary key,
  document_id text not null references knowledge_documents(id) on delete cascade,
  document_version_id text not null references knowledge_document_versions(id) on delete cascade,
  heading_path text[] not null default '{}',
  markdown text not null,
  char_start integer not null,
  char_end integer not null,
  chunk_hash text not null,
  created_at timestamptz not null default now(),
  check (char_end >= char_start)
);

create index if not exists idx_knowledge_chunks_document_version
  on knowledge_document_chunks(document_version_id, char_start);

create table if not exists knowledge_evidence (
  id text primary key,
  document_id text not null references knowledge_documents(id) on delete cascade,
  document_version_id text not null references knowledge_document_versions(id) on delete cascade,
  version_hash text not null,
  chunk_id text not null references knowledge_document_chunks(id) on delete cascade,
  chunk_hash text not null,
  char_start integer not null,
  char_end integer not null,
  excerpt text not null,
  locator_version text not null,
  extractor_version text not null,
  source_output_id text not null,
  created_at timestamptz not null default now(),
  check (char_end >= char_start)
);

create index if not exists idx_knowledge_evidence_document_version
  on knowledge_evidence(document_id, document_version_id, created_at desc);

-- ── extraction jobs · outputs ─────────────────────────────────────────────
create table if not exists knowledge_extraction_jobs (
  id text primary key,
  document_id text not null references knowledge_documents(id) on delete cascade,
  document_version_id text not null references knowledge_document_versions(id) on delete cascade,
  extractor_version text not null,
  idempotency_key text not null unique,
  status text not null check (
    status in ('queued', 'leased', 'processing', 'succeeded', 'failed', 'superseded')
  ),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  retryable boolean not null default true,
  next_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  generation integer not null default 0,
  error_code text,
  error_message text,
  superseded_by_job_id text references knowledge_extraction_jobs(id),
  requested_by citext not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_jobs_document_created
  on knowledge_extraction_jobs(document_id, created_at desc);
create index if not exists idx_knowledge_jobs_status_lease
  on knowledge_extraction_jobs(status, lease_expires_at);

create table if not exists knowledge_extraction_outputs (
  id text primary key,
  job_id text not null references knowledge_extraction_jobs(id) on delete cascade,
  document_id text not null references knowledge_documents(id) on delete cascade,
  document_version_id text not null references knowledge_document_versions(id) on delete cascade,
  extractor_version text not null,
  provider text not null,
  summary text,
  nodes_json jsonb not null default '[]'::jsonb,
  edges_json jsonb not null default '[]'::jsonb,
  warnings text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_outputs_document_created
  on knowledge_extraction_outputs(document_id, created_at desc);
create index if not exists idx_knowledge_outputs_job_id
  on knowledge_extraction_outputs(job_id);

-- evidence.source_output_id → extraction_outputs.id (loose FK; outputs may
-- be GC'd while evidence is retained, hence no cascade)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_knowledge_evidence_source_output'
  ) then
    alter table knowledge_evidence
      add constraint fk_knowledge_evidence_source_output
      foreign key (source_output_id) references knowledge_extraction_outputs(id)
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

-- ── review + audit events ────────────────────────────────────────────────
create table if not exists knowledge_reviews (
  id text primary key,
  document_id text not null references knowledge_documents(id) on delete cascade,
  document_version_id text not null references knowledge_document_versions(id) on delete cascade,
  job_id text references knowledge_extraction_jobs(id) on delete set null,
  type text not null check (type in ('document-batch', 'merge', 'low-confidence')),
  status text not null check (
    status in ('open', 'approved', 'rejected', 'snoozed', 'superseded')
  ),
  payload jsonb not null default '{}'::jsonb,
  assigned_to citext,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_reviews_document
  on knowledge_reviews(document_id, created_at desc);
create index if not exists idx_knowledge_reviews_status
  on knowledge_reviews(status, updated_at desc);

create table if not exists knowledge_review_events (
  id text primary key,
  review_id text not null references knowledge_reviews(id) on delete cascade,
  document_id text not null references knowledge_documents(id) on delete cascade,
  action text not null,            -- "approve" | "reject" | "snooze" | "comment"
  actor citext not null,
  from_status text,
  to_status text not null,
  decision_payload jsonb not null default '{}'::jsonb,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_review_events_review
  on knowledge_review_events(review_id, created_at desc);

create table if not exists knowledge_approval_events (
  id text primary key,
  entity_type text not null check (entity_type in ('node', 'edge')),
  entity_id text not null,
  review_id text references knowledge_reviews(id) on delete set null,
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  approved_by citext not null,
  approved_at timestamptz not null default now(),
  reverts_event_id text references knowledge_approval_events(id) on delete set null
);

create index if not exists idx_knowledge_approval_events_entity
  on knowledge_approval_events(entity_type, entity_id, approved_at desc);

-- ── approved canonical graph (admin private) ──────────────────────────────
create table if not exists knowledge_approved_nodes (
  id text primary key,
  title text not null,
  kind text not null,
  project_ids text[] not null default '{}',
  parent_id text,
  summary text,
  evidence_ids text[] not null default '{}',
  current_revision_id text references knowledge_approval_events(id) on delete set null,
  last_approved_at timestamptz not null default now(),
  last_approved_by citext not null,
  -- self-referencing parent (deferred to allow bulk loads)
  constraint fk_knowledge_approved_nodes_parent
    foreign key (parent_id) references knowledge_approved_nodes(id)
    on delete set null
    deferrable initially deferred
);

create index if not exists idx_knowledge_approved_nodes_parent
  on knowledge_approved_nodes(parent_id) where parent_id is not null;

create table if not exists knowledge_approved_edges (
  id text primary key,
  from_node_id text not null references knowledge_approved_nodes(id) on delete cascade,
  to_node_id text not null references knowledge_approved_nodes(id) on delete cascade,
  type text not null check (
    type in ('depends_on', 'implements', 'uses', 'describes', 'related_to')
  ),
  project_ids text[] not null default '{}',
  evidence_ids text[] not null default '{}',
  current_revision_id text references knowledge_approval_events(id) on delete set null,
  last_approved_at timestamptz not null default now(),
  last_approved_by citext not null,
  check (from_node_id <> to_node_id)
);

create index if not exists idx_knowledge_approved_edges_from
  on knowledge_approved_edges(from_node_id);
create index if not exists idx_knowledge_approved_edges_to
  on knowledge_approved_edges(to_node_id);

-- ── publish runs + public projection ─────────────────────────────────────
create table if not exists knowledge_publishes (
  id text primary key,
  status text not null check (
    status in ('running', 'succeeded', 'failed', 'rolled-back')
  ),
  initiated_by citext not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_approved_revision text not null,
  node_count integer,
  edge_count integer,
  projection_version text not null,
  error_code text,
  error_message text,
  rollback_of_publish_id text references knowledge_publishes(id)
);

create index if not exists idx_knowledge_publishes_started
  on knowledge_publishes(started_at desc);

create table if not exists knowledge_public_nodes (
  id text primary key,
  title text not null,
  kind text not null,
  project_ids text[] not null default '{}',
  parent_id text,
  summary text,
  evidence_count integer not null default 0,
  publish_id text not null references knowledge_publishes(id) on delete cascade,
  projection_version text not null,
  published_at timestamptz not null,
  last_approved_at timestamptz not null
);

create index if not exists idx_knowledge_public_nodes_publish
  on knowledge_public_nodes(publish_id);

create table if not exists knowledge_public_edges (
  id text primary key,
  from_node_id text not null,
  to_node_id text not null,
  type text not null,
  project_ids text[] not null default '{}',
  publish_id text not null references knowledge_publishes(id) on delete cascade,
  projection_version text not null,
  published_at timestamptz not null,
  last_approved_at timestamptz not null,
  check (from_node_id <> to_node_id)
);

create index if not exists idx_knowledge_public_edges_publish
  on knowledge_public_edges(publish_id);
create index if not exists idx_knowledge_public_edges_endpoints
  on knowledge_public_edges(from_node_id, to_node_id);

create table if not exists knowledge_public_meta (
  id text primary key default 'current',
  current_publish_id text references knowledge_publishes(id) on delete set null,
  published_at timestamptz not null,
  projection_version text not null,
  check (id = 'current')
);
