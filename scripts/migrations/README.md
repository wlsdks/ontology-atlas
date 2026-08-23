# Vault migrations

> The vault frontmatter is the schema. Adding keys, renaming, or cleaning values
> requires batch-modifying N files in the user's
> vault. This directory is the single source of truth for those migration
> patterns.

## Usage

Run the following commands from the Ontology Atlas source checkout root.

```bash
# List available migrations
pnpm vault:migrate --list

# Dry-run (default)
pnpm vault:migrate <id>
pnpm vault:migrate <id> --vault /path/to/my/vault

# Apply for real (modifies files)
pnpm vault:migrate <id> --write

# Conscious force (bypasses uncommitted .md guard — risky)
pnpm vault:migrate <id> --write --force
```

## Safety Net (R11 #21)

In `--write` mode, if the vault is a git repo with any uncommitted .md changes,
the migrator rejects the operation. This prevents mixing migration results with
user changes, which would make rollback difficult. Commit or stash first and retry,
or add `--force` to consciously override.

`<id>` is the stem of the filename (e.g., `2026-05-04-trim-frontmatter-values`).

If no vault path is specified, use the dogfood vault (`docs/ontology/`).

### v1 → v2: Issue Node UIDs

```bash
pnpm vault:migrate 2026-08-02-add-node-uids --vault /path/to/vault
pnpm vault:migrate 2026-08-02-add-node-uids --vault /path/to/vault --write
```

Issues UIDs only for `kind:` nodes that lack one. Valid existing UIDs are preserved;
malformed, primary/merged conflicts, and irregular merge histories are rejected during
the planning phase, failing before any files are written. `scripts/migrate-node-uids.mjs`
is a first-party compatible wrapper using the same implementation; use the canonical
runner above for new usage.

## Writing Migrations

Each migration is a `migrations/<YYYY-MM-DD>-<slug>.mjs` file with the following shape:

```js
export const id = "2026-05-04-trim-frontmatter-values";
export const description = "One-line explanation — what it changes and why.";

// Optional: validate the entire vault first or assign identities.
export function prepare(files) {
  return { /* immutable plan for migrate to read */ };
}

/**
 * @param {{ path: string; raw: string; relativePath: string }} file
 * @returns {{ raw: string } | null} null = no-op (skip)
 */
export function migrate(file, context) {
  // Transform input raw to return new raw.
  // If null or raw is identical, count as no change.
  return { raw: transformedRaw };
}
```

## Principles

1. **Prefer line-based transformations** — Round-tripping frontmatter parse → reserialize
   risks losing comments, whitespace, and sorting order. Text pattern substitution is safer.
2. **Idempotent** — Running the same migration twice yields the same result as running it once.
3. **Dry-run is default** — Users must explicitly pass `--write` to record to disk,
   aligning with AGENTS.md's "Risky actions warrant confirmation" policy.
4. **Rollback via git** — Migrations do not provide inverses themselves.
   Users recover via git or vault backups.
