-- Aslan Project Map · 040 · External API keys (M2)
-- Firestore path: accounts/{accountId}/apiKeys/{keyId}.
-- Used by external clients (CLI · CI · MCP server) to POST /api/v1/docs etc.
--
-- Security:
--   - key_hash stores SHA-256(plaintext); the plaintext is shown in UI once at
--     generation, never at rest.
--   - key_prefix = first 8 chars of the plaintext (for "Which key is this?"
--     identification in the UI).
--   - revoked_at is soft-delete (audit preservation).

create extension if not exists citext;

create table if not exists api_keys (
  id text not null,
  account_id text not null references accounts(id) on delete cascade,
  name text not null,
  key_hash text not null,
  key_prefix text not null,                                -- first 8 chars of plaintext
  scope text not null check (scope in ('account-rw')),    -- v1 single scope
  created_at timestamptz not null default now(),
  created_by citext not null,
  last_used_at timestamptz,
  usage_count bigint not null default 0,
  revoked_at timestamptz,                                  -- null = active
  primary key (account_id, id),
  unique (key_hash)                                        -- global lookup on inbound request
);

-- Active-keys index used by HTTP endpoint auth path.
create index if not exists idx_api_keys_account_active
  on api_keys(account_id, created_at desc) where revoked_at is null;
