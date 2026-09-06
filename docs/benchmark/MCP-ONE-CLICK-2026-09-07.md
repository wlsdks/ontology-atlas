# How other open-source clients make an MCP server one press — 2026-09-07

> Written to answer two owner questions on 2026-09-07: *"one-click MCP
> connection is how everyone does it now — npx installs, or a token from the
> provider? Find out how the others do it (open source)."* and *"how do I
> connect Notion, Atlassian, GitHub? Claude Code and Codex do it fast — is that
> because they are partners?"*
>
> Every claim below carries a source and the date it was observed. Where a
> source could not be confirmed it says so rather than rounding up. Reuse rule
> for everything here: **ideas are free, code is not.** Nothing in this note was
> copied; the licence column exists so a later reader knows what may be.

## The short answer

1. **Nobody installs anything.** Not the registry, not Claude Code, not Cursor.
   "One-click" writes a config entry; the package is fetched by `npx`/`uvx`/
   `docker` the first time the server process starts, which is the person's own
   runtime doing what it always does.
2. **The hard part was never the command — it was the credential.** Two shapes
   exist. A **local** server needs a token the person pastes (`NOTION_TOKEN`,
   `GITHUB_PERSONAL_ACCESS_TOKEN`). A **remote** server needs an OAuth consent
   in a browser and needs nothing typed at all.
3. **The remote shape is why Claude Code feels instant, and it is not a
   partnership.** The MCP authorization spec lets the *server* mint a client id
   for whichever client shows up, so any spec-compliant client connects to any
   spec-compliant server with no prior agreement.
4. **Deep links are the "Add to X" button, and they are also the one part with
   a CVE history.** Every shipped one shows a confirmation first; the ones that
   showed an incomplete confirmation were exploited.
5. **For Atlas the consequence is small and specific.** Atlas is not the MCP
   client — the coding agent is. So Atlas never performs OAuth, never holds an
   OAuth token, and its whole job is to write a descriptor a person can read and
   then get out of the way.

---

## 1. The official MCP Registry

`registry.modelcontextprotocol.io` is live and in preview. It is
**metadata only**: it stores pointers at packages on npm / PyPI / Docker Hub /
NuGet / crates.io and hosts no code. It is run by a community working group
(Stacklok lead, with PulseMCP, TeamSpark and Ravenmail), backed by Anthropic,
GitHub, Microsoft and PulseMCP — owned by none of them.
(<https://modelcontextprotocol.io/registry/about>, observed 2026-09-07.)

| | |
|---|---|
| List | `GET /v0/servers` → `{"servers": [...], "metadata": {"nextCursor", "count"}}`; cursor paging, `limit`, `search`, `server-id` filters |
| One | `GET /v0/servers/{id}` |
| Shape | each item is `{"server": {...}, "_meta": {...}}` — publisher-authored fields in `server`, registry-managed ones (`isLatest`, timestamps, status) in `_meta` |
| Scale | ~9,652 latest-version records reported May 2026; not re-counted today |
| Licence | server metadata is **CC0-1.0**, perpetual and irrevocable, per the registry Terms of Service. The packages it points at keep their own licences |
| Durability | no SLA; the docs themselves recommend ETL-ing `GET /v0/servers` and caching |

That CC0 line is the one that matters here: a catalogue built from this data may
be committed into Atlas without a licence problem. (Terms:
<https://modelcontextprotocol.io/registry/terms-of-service>, observed
2026-09-07. Live probe of `/v0/servers?limit=3` returned HTTP 200 and the shape
above on 2026-09-07.)

### `server.json`, the field names that matter

Current schema `https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json`;
the live API on 2026-09-07 returned documents declaring
`.../schemas/2025-12-11/server.schema.json`. The 2025-09-16 revision renamed
every key from snake_case to **camelCase** (`registry_type` → `registryType`,
`environment_variables` → `environmentVariables`), and camelCase is what the API
returns today.

| Block | Fields |
|---|---|
| `packages[]` | `registryType` (`npm` · `pypi` · `oci` · `nuget` · `cargo` · `mcpb`), `registryBaseUrl`, `identifier`, `version`, `runtimeHint` (`npx` · `uvx` · `dnx`), `transport` |
| `environmentVariables[]` | `name`, `description`, `isRequired`, `isSecret`, `format`, `default`, `choices` |
| `packageArguments[]` / `runtimeArguments[]` | `type` (`positional` · `named`), `name`, `value`, `valueHint`, `description`, `isRequired`, `isRepeated`, `default` |
| `remotes[]` | `type` (`streamable-http` · `sse`), `url`, `headers[]` (each with `isRequired`/`isSecret`), `variables` |

`isSecret` is the field Atlas's catalogue needs most: it is the publisher saying
"this one is a credential", which is exactly the judgement
`looksLikeSecretKey()` in `src/shared/lib/connector-record.ts` has to make from
a name alone today.
(<https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md>,
observed 2026-09-07.)

## 2. Command-line adds

`claude mcp add [--transport stdio|sse|http] [--scope local|project|user]
[--env K=V] [--header "K: V"] <name> <url>` — or `<name> -- <command> [args]`
for stdio, where the `--` is required. `claude mcp add-json <name> '<object>'`
takes the server object directly; `claude mcp add-from-claude-desktop` imports
an existing Claude Desktop config. `--scope project` writes `.mcp.json`, which
is the file Atlas's own discovery already reads.

```json
{ "mcpServers": {
  "notion":  { "type": "http",  "url": "https://mcp.notion.com/mcp" },
  "local":   { "type": "stdio", "command": "npx", "args": ["-y", "pkg"], "env": {} }
} }
```

Claude Code **requires an explicit `type`**, unlike Claude Desktop; a `url` with
no `type` is treated as a broken stdio entry and skipped with a warning.
(<https://code.claude.com/docs/en/mcp>, observed 2026-09-07.)

No install step happens at any point. The registry hosts no code and Claude
writes a config line; `npx -y <pkg>` fetches the package when the child process
first starts.

## 3. Deep links — the "Add to X" button

| Client | Shape | Encoding | Confirmation |
|---|---|---|---|
| Cursor | `cursor://anysphere.cursor-deeplink/mcp/install?name=<n>&config=<base64>` | the whole server-config object, `JSON.stringify` then standard base64 (not base64url), used raw as a query value | yes — a speedbump naming server and command |
| VS Code | `vscode:mcp/install?<url-encoded json>` (`vscode-insiders:` variant) | `encodeURIComponent(JSON.stringify(obj))`; the object is one `servers` entry plus `name` | yes — an explicit trust confirmation with a link to review the config |
| Goose | `goose://extension?cmd=&arg=&arg=&id=&name=&description=&timeout=` | repeated `arg` params; `env=KEY=desc` for secrets; remote variant uses `type=streamable_http&url=` | yes, an Install dialog |
| Zed | none | — | adds MCP servers as packaged extensions or hand-written `settings.json` entries; has said it will move to the official registry |

Cursor does not publish its URL spec; the shape above is reconstructed from
third-party generator scripts. VS Code documents its own
(<https://code.visualstudio.com/docs/agent-customization/mcp-servers>, observed
2026-09-07). Goose: <https://goose-docs.ai/docs/getting-started/using-extensions/>,
observed 2026-09-07. Zed:
<https://zed.dev/docs/ai/mcp>, observed 2026-09-07.

### The deep link is where the breaches were

- **CVE-2025-54133 / "DeepJack"** — Cursor's `mcp/install` confirmation did not
  show the real arguments, so a two-click social-engineering flow could hide a
  malicious command. The follow-up nested a second `mcp/install` URI inside
  another parameter that Cursor does not recursively decode.
  (<https://adversa.ai/blog/cursor-security-deepjack-deeplink-vulnerability-mcp-rce>,
  observed 2026-09-07.)
- **CVE-2025-54136 "MCPoison"** — Cursor trusted the config *key name* rather
  than the command, so a shared `.cursor/mcp.json` could swap the command in
  without re-prompting. Fixed in Cursor 1.3.
  (<https://research.checkpoint.com/2025/cursor-vulnerability-mcpoison>,
  observed 2026-09-07.)
- **CVE-2025-54135 "CurXecute"** — poisoned Slack content read by the agent
  rewrote the MCP config and launched a server with no further user action.
- **Tool poisoning / "rug pull"** — a server may change an already-approved
  tool's description after install, because most clients verify only once.
  (<https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks>,
  observed 2026-09-07.)

The lesson Atlas has to encode: **the confirmation must show what will actually
run, decoded, in full** — which is the rule `whatRuns()` already implements for
attached rows and which the deep-link path must not undercut.

## 4. Catalogues and marketplaces

| Product | How it installs | Account | Catalogue licence |
|---|---|---|---|
| Cline Marketplace | in-app one-click; Cline clones and configures, may prompt for a key | none to browse or install | index repo MIT |
| Roo Code | in-app Install, pick Project/Global and NPX/Docker | not documented | not documented |
| Smithery | registry **plus hosted remote execution on Smithery's own infrastructure** | account + API key for the CLI | not uniformly stated |
| Glama | listing only (~82.5k servers), documented API | none to browse | per-server; directory itself unclear |
| mcp.so | community listing | none | not documented |
| PulseMCP | directory (21,970+), own sub-registry API | none stated | not documented |

Smithery is the only one of these that proxies traffic through itself, which
rules it out as a source for a local-first product regardless of licence. The
official registry's CC0 is the only clean one.

## 5. OAuth for remote servers

Spec revisions: 2024-11-05 → 2025-03-26 → 2025-06-18 → 2025-11-25 →
**2026-07-28** (current).

| Requirement | 2025-06-18 | 2026-07-28 |
|---|---|---|
| PKCE (S256) | client **MUST** | **MUST** |
| RFC 8414 AS metadata | client **MUST** | **MUST** support, but the AS may serve OIDC Discovery instead |
| RFC 9728 protected-resource metadata | **MUST**, both sides | unchanged |
| RFC 7591 dynamic client registration | **SHOULD** | downgraded to **MAY**; formally deprecated in favour of Client ID Metadata Documents |
| RFC 8707 resource indicators | client **MUST** send `resource` | unchanged |
| RFC 9207 issuer identification | absent | AS **SHOULD** send `iss`; client **MUST** validate it |

The sequence a "Connect" button implements: unauthenticated request → `401` with
`WWW-Authenticate: Bearer resource_metadata="…"` → protected-resource metadata →
AS metadata → client registration (CIMD, else DCR, else a static client) →
system browser with `code_challenge` and `resource` → callback → token exchange
with `code_verifier` → bearer on every later request, refreshed on 401.
(<https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization>,
observed 2026-09-07.)

Where real clients keep the token: Cursor and Claude Code in the OS keychain;
VS Code in OS-backed secret storage since 1.123; the community `mcp-remote`
proxy in plaintext under `~/.mcp-auth/` — which is the counter-example, not the
model. (<https://code.visualstudio.com/updates/v1_123>,
<https://github.com/punkpeye/mcp-remote>, observed 2026-09-07.)

Reusable implementations if one is ever needed: `punkpeye/mcp-remote` (MIT) and
`modelcontextprotocol/typescript-sdk` `examples/oauth/` (Apache-2.0 for new
files, MIT for older ones — the project is mid-migration, so check each header).

## 6. The three worked examples

### Notion

| | |
|---|---|
| Remote | `https://mcp.notion.com/mcp` (Streamable HTTP); `https://mcp.notion.com/sse` for clients without it |
| Remote auth | OAuth browser flow, required — Notion states there is no headless option |
| Local | `npx -y @notionhq/notion-mcp-server` |
| Local secret | `NOTION_TOKEN=ntn_…` (recommended) or `OPENAPI_MCP_HEADERS={"Authorization":"Bearer ntn_…","Notion-Version":"2025-09-03"}` |
| Token issued at | <https://www.notion.so/profile/integrations> |

`OPENAPI_MCP_HEADERS` is the variable that already defeated Atlas's name-based
secret detection once (recorded in `connector-record.ts`), and it is Notion's own
documented form — a good argument for a catalogue that carries `isSecret` from
the publisher rather than guessing.
(<https://developers.notion.com/guides/mcp/get-started-with-mcp> and
<https://github.com/makenotion/notion-mcp-server>, observed 2026-09-07. The
per-page consent picker described in community write-ups is **not** confirmed in
Notion's own material; the package licence was not stated on either page.)

### Atlassian

| | |
|---|---|
| Remote | `https://mcp.atlassian.com/v2/mcp` (recommended); `/v1/mcp` still works; `/v1/sse` is retired |
| Auth | OAuth 2.1 through the Atlassian account, scopes such as `read_jira`, `write_jira`, `read_confluence`; an API-token path exists for service accounts |
| Local | none — cloud only. The apparent "local" option is `npx -y mcp-remote https://mcp.atlassian.com/v2/mcp`, a proxy to the same endpoint, not an independent server |

(<https://github.com/atlassian/atlassian-mcp-server>, observed 2026-09-07. A
February 2026 GA date appears only in a secondary source.)

### GitHub

| | |
|---|---|
| Remote | `https://api.githubcopilot.com/mcp/`, with `/readonly`, `/x/{toolset}` and combinations such as `/x/repos/readonly`; also `X-MCP-Toolsets` / `X-MCP-Readonly` headers |
| Auth | one-click OAuth by default; a PAT in `Authorization: Bearer` also works |
| Copilot plan | **not required** for the server; only specific Copilot-linked tools need one |
| Local | `docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server`, or the Go binary |
| Token issued at | <https://github.com/settings/personal-access-tokens/new> |
| Licence | MIT |

(<https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md>
and the GitHub Docs set-up page, observed 2026-09-07.)

### So is it a partnership?

No. `claude mcp add --transport http notion https://mcp.notion.com/mcp`
followed by `/mcp` opens a browser and works because **Claude Code implements
the authorization spec generically**: dynamic client registration means Notion's
own authorization server mints a client id for whatever client appears, so no
prior agreement between Anthropic and Notion is needed. Codex does the same
through `codex mcp add --url …` and `codex mcp login <name>`, storing
credentials in the system keyring. (Codex has one open gap: `codex mcp add`
cannot yet set the `oauth_resource` indicator some enterprise-gated servers
want — openai/codex issue #23846, observed 2026-09-07.)

What a partnership actually buys is a **listing**: a place in Anthropic's
curated Connectors directory, vetted against a directory policy, versus a
"custom connector" anyone can add by URL on a paid plan. It can also buy a
pre-registered OAuth client instead of relying on DCR. Neither changes what the
protocol allows.
(<https://claude.com/docs/connectors/directory>,
<https://support.claude.com/en/articles/11175166>, observed 2026-09-07.)

## 7. What is portable to Atlas, and what is not

Atlas promises: works offline, nothing leaves the machine unless the person
turns it on, no third-party code executed by Atlas, every change visible as a
diff (`.claude/rules/forbidden.md`, `.claude/rules/local-first.md`).

| Idea | Portable? | Why |
|---|---|---|
| A catalogue of well-known servers with package, args, required variables and `isSecret` | **yes, as a committed generated file** | CC0 data; refreshed by a person; `scripts/build-acp-registry.mjs` already sets this precedent for the ACP runtime list |
| Fetching that catalogue at runtime | **no** | breaks "works offline" and "nothing leaves unless turned on" at once — the exact reasoning already written at the top of `build-acp-registry.mjs` |
| Hosted marketplaces (Smithery et al.) | **no** | account-gated, and one of them proxies the traffic |
| A deep link that pre-fills and waits for a press | **yes** | it writes nothing on its own; the confirmation must show the decoded command in full, which is the lesson of CVE-2025-54133 |
| A deep link that installs on arrival | **no** | that is the CVE |
| Atlas performing OAuth for a remote server | **no, and unnecessary** | Atlas is not the MCP client. The coding agent opens the connection, so the agent does the sign-in and holds the token. Atlas writing "we will connect you to Notion" would be claiming an act it does not perform |
| Asking for one token, with a link to where it is issued | **yes** | already the keychain path in `src-tauri/src/connector_secrets.rs`; the catalogue only supplies the link and the variable name |
| Running an install script for the person | **no** | already refused for agent CLIs in `AcpRuntimeSettings.tsx`, for the same reason: a URL's contents can change and cannot be shown as a diff |

## 8. Recommendation

1. **Ship a committed catalogue.** Generated from the CC0 registry plus
   hand-verified vendor facts by `scripts/build-mcp-catalogue.mjs`, stating its
   entry count and generation date in the file, never fetched at runtime. Notion,
   Atlassian and GitHub are the first three rows, each carrying both a remote and
   a local variant.
2. **Make the two shapes visible, because they ask different things of a
   person.** A remote entry asks for nothing and ends in the agent's own browser
   consent. A local entry asks for exactly one token and links to the page that
   issues it. Any screen that blurs these is the screen the owner already could
   not follow.
3. **Say who does the signing in.** For a remote entry Atlas writes a descriptor
   and stops. The sentence on screen has to name the coding agent as the party
   that opens the browser and holds the token, or Atlas is taking credit for
   custody it does not have — the same honesty rule that made
   `.ontology-atlas/llm-audit.jsonl` state what it does *not* cover.
4. **Parse the deep link, register the scheme later.** The parser and the
   pre-fill are cheap and testable now; registering `ontology-atlas://` needs a
   Tauri plugin, and the confirmation it feeds already exists.
5. **Keep the expert path expert.** Tabs, catalogue and deep link belong to
   people who know the words. The person who wants their Notion pages in the
   Library should never meet `npx`, `stdio` or an environment variable at all.
