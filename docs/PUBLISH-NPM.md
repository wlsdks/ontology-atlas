# npm publish — step-by-step guide

This project publishes two npm packages:

| Package | Path | What | Required? |
|---|---|---|---|
| `oh-my-ontology-mcp` | `mcp/` | MCP server (AI agents read/write the vault) | **Required** — the core of the AI agent integration |
| `oh-my-ontology` | `cli/` | 25-command developer CLI (vault scaffold, bootstrap, compile, graph CRUD/deep dive) | **Recommended** — the shortest terminal path and the MCP-backed developer surface |

> **Cost**: $0. Public npm packages are permanently free. Unlimited downloads / users.
> You do need an npm account with 2FA (free).

> 🚫 **AI agent guard**: This project blocks `npm publish` / `pnpm publish` / `yarn publish` from being run by Claude Code or any AI agent — see `.claude/settings.json`, `CLAUDE.md`, `.claude/rules/forbidden.md`. You (the human maintainer) run these commands yourself, in a real terminal, after deliberate review.

---

## Pre-flight check (already done, kept for reference)

Both npm packages require Node 20+. Verify the maintainer shell and release
smoke shell use the same floor:

```bash
node --version
# must print v20.x or higher
```

`npm pack --dry-run` shows exactly which files would be published:

```bash
cd mcp
npm pack --dry-run
# Tarball Contents — README.md, package.json, src/*, scripts/verify.mjs
# Current package: oh-my-ontology-mcp@0.12.0

cd ../cli
npm pack --dry-run
# README.md, package.json, src/index.mjs, src/commands/*, src/lib/*, templates/vault/*.md
# Current package: oh-my-ontology@0.11.0
```

We've audited: 0 secrets, 0 PII, 0 absolute paths.

---

## Step 1 — npm account and login

### a) Create an npm account (skip if you already have one)

1. https://www.npmjs.com/signup — email + password (use a strong one).
2. Verify the email link npm sends.
3. **Strongly recommended: enable 2FA** to protect against account lockout / takeover:
   - After login, visit https://www.npmjs.com/settings/{username}/account
   - "Two-Factor Authentication" → "Enable 2FA"
   - Pick "auth-only" (OTP only at publish time) and scan the QR with a mobile OTP app (1Password / Authy / Google Authenticator).
   - **Save the recovery codes somewhere safe.**

### b) Login from the terminal

```bash
npm login
# Browser opens to the npm login page.
# After you log in, enter the OTP.
# "Logged in as <username>" means success.
```

Verify:

```bash
npm whoami
# prints your username
```

---

## Step 2 — Check the package names are available

```bash
npm view oh-my-ontology
# "404 Not Found" = name available ✅
# Any other output = someone else owns this name

npm view oh-my-ontology-mcp
# Same check
```

If a name is taken:

- Option A: pick another name (e.g. `wlsdks-oh-my-ontology`)
- Option B: use a scope (`@wlsdks/oh-my-ontology`) — public scopes are also free

---

## Step 3 — Publish the MCP server (this is the important one)

```bash
cd mcp
npm publish --access=public
# Enter OTP when prompted (if 2FA enabled)
# "+ oh-my-ontology-mcp@0.12.0" = success
```

Verify:

- https://www.npmjs.com/package/oh-my-ontology-mcp shows the package page
- `npx -y oh-my-ontology-mcp` works from any folder. Test from a fresh shell:

```bash
cd /tmp
OMOT_VAULT=/path/to/some/folder npx -y oh-my-ontology-mcp
# Server starts, waits on stdin. Ctrl+C to exit.
```

---

## Step 4 — Publish the CLI (optional)

Publish MCP first. The CLI package depends on the current MCP package
(`oh-my-ontology-mcp@^0.12.0`) for graph-level commands such as `compile`,
`bootstrap`, `rename`, and `node`.

```bash
cd cli
npm publish --access=public
# OTP if needed
```

Verify:

```bash
cd /tmp
npx oh-my-ontology --help
# prints help
npx oh-my-ontology --version
# prints 0.11.0
npx oh-my-ontology init test-vault
# creates test-vault/ with 5 .md files + wired .mcp.json
rm -rf test-vault
```

Don't want to publish the CLI? Users can still create starter files from the
web workbench's `/docs` page → "Create starter seed" button. But they will miss
the terminal-native graph workflow (`bootstrap`, `compile --fix`, graph CRUD,
deep-dive commands), so publishing the CLI is recommended for AI-native
developers.

---

## Step 5 — Confirm everything works

### A) Register with an AI agent (Claude Code example)

In `~/.config/claude-code/mcp.json` (or wherever your agent reads MCP config):

```json
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "npx",
      "args": ["-y", "oh-my-ontology-mcp"],
      "env": {
        "OMOT_VAULT": "/Users/me/my-vault"
      }
    }
  }
}
```

Restart Claude Code. The tool list should show the `oh-my-ontology` namespace with 23 tools.

### B) Start a user vault (CLI path)

```bash
# from anywhere
npx oh-my-ontology init my-vault
cd my-vault
ls -la
# 5 .md files + .mcp.json
```

### C) Start a user vault (workbench path)

1. https://oh-my-ontology.web.app/docs (after Firebase deploy)
2. "Open my markdown folder" → pick an empty folder
3. Click "Create starter seed"
4. 5 .md files + a copyable .mcp.json.example are written automatically

---

## Unpublish / remove a package

Within 24 hours of publish, you can unpublish (for honest mistakes):

```bash
npm unpublish oh-my-ontology-mcp@0.12.0
npm unpublish oh-my-ontology@0.11.0
```

After 24 hours, unpublish is no longer allowed — only `deprecate` (installers see a warning, the version stays):

```bash
npm deprecate oh-my-ontology-mcp@0.12.0 "0.12.0 has a critical bug, use 0.12.1+"
npm deprecate oh-my-ontology@0.11.0 "0.11.0 has a critical bug, use 0.11.1+"
```

> So always run `npm pack --dry-run` once more before the first publish.
> We've already audited.

---

## Bumping the version (every subsequent publish)

After code changes, you must bump the version — npm rejects republishing the same one:

```bash
cd mcp
# Patch (bug fix): 0.12.0 → 0.12.1
npm version patch
# Or minor: 0.12.0 → 0.13.0
npm version minor
# Or major: 0.12.0 → 1.0.0
npm version major

npm publish --access=public
```

`npm version` automatically updates `package.json`, creates a git commit, and tags it.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `403 Forbidden` | 2FA OTP wrong or expired. Try again. |
| `404 Not Found` (on publish) | Scoped package without `--access=public`. Add the flag. |
| `EEXIST` (`oh-my-ontology` already exists) | Name conflict. Pick a different name or use a scope. |
| `npx oh-my-ontology` doesn't work right after publish | npm CDN takes 1–2 min to propagate. Wait and retry. |
| Claude Code blocks the publish command | Expected — see "AI agent guard" up top. Run from a real terminal yourself. |

---

## One-line summary

```bash
# Once (account + login)
npm login

# Each publish
cd mcp && npm publish --access=public
cd ../cli && npm publish --access=public

# Smoke test
cd /tmp && npx oh-my-ontology init test-vault && rm -rf test-vault
```

Free. Reversible within 24h. Unlimited users forever.
