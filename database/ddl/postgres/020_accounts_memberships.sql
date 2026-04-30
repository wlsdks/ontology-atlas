-- Aslan Project Map · 020 · Accounts & memberships
-- Multi-tenant roots. Corresponds to Firestore `accounts/{accountId}` and
-- `accountMemberships/{uid}__{accountId}`. See `docs/DATA-MODEL.md §3`.

create extension if not exists citext;

create table if not exists accounts (
  id text primary key,
  name text not null,
  description text,
  -- isPublic=true exposes read via /?account={id} and /project/view/?account={id}.
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists account_memberships (
  -- Firestore doc id format: "{uid}__{accountId}".
  id text primary key,
  account_id text not null references accounts(id) on delete cascade,
  uid text not null,
  email citext,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, uid)
);

-- Lookup by uid (common path: "my memberships") and by email (invite by email).
create index if not exists idx_account_memberships_uid
  on account_memberships(uid);
create index if not exists idx_account_memberships_email
  on account_memberships(email) where email is not null;
create index if not exists idx_account_memberships_account_role
  on account_memberships(account_id, role);
