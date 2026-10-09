# Security audit

`SECURITY.md` is the public threat model. `.claude/rules/local-first.md`,
`.claude/rules/forbidden.md` ("Data and security") and
`.claude/rules/surfaces.md` (the bridge roster and the one agent-config
exception) are the boundaries. The audit finds where untrusted input crosses
them. It never reads credentials or scans anything outside this repository.

## 0. Run the floor

    pnpm test:security
    pnpm desktop:check
    pnpm audit --prod --audit-level=high
    pnpm --dir mcp audit --prod --audit-level=high
    cargo audit --file src-tauri/Cargo.lock    # when installed; the release workflow also runs it

A red line is the first finding. A green floor proves only what those gates
cover.

## 1. One reviewer per area

Give each area to its own read-only reviewer agent, briefed with
the current host's reviewer brief, in parallel. Each gets
its area below, this skill, `SECURITY.md`, and the report shape in §3, and
builds its inventory with commands, never from memory.

- **MCP and CLI.** Input: tool arguments an agent sends after reading injected
  text, vault and repository file content, `absorb_document` input. Reach: a
  path outside the granted root (`..`, a symlink, an absolute path), a process
  or shell string, a write without approval or an `expected_mtime` guard, the
  network. Inventory: every path-typed tool argument, and every `spawn`,
  `exec`, `fetch`, `realpath` and `resolve` call under `mcp/src` and `cli/src`.
- **Tauri desktop.** Input: anything the WebView can send to a command, deep
  links, the update feed. Reach: a command acting past the vault, a capability
  grant, the CSP, a secret leaving Rust, an unsigned update. Inventory: every
  `#[tauri::command]` in `src-tauri/src`, the capability files, and
  `src-tauri/tauri.conf.json`.
- **Web renderer and connectors.** Input: vault Markdown, agent and ACP
  output, connector config, wiki pages. Reach: injected HTML, a `javascript:`
  or `file:` URL in a link or `window.open`, the external-link door, an env or
  header value leaving connector discovery. Inventory: every
  `dangerouslySetInnerHTML`, `react-markdown`, `window.open` and computed
  `href` under `src` and `app`.
- **Supply chain and CI.** Input: a fork's pull request, a new dependency or
  action, an install script, a downloaded runtime. Reach: a secret in a
  pull-request workflow, `pull_request_target`, an untrusted `${{ }}` in a
  `run:` block, an unpinned action or runtime, the updater signing key.
  Inventory: `.github/workflows`, the lockfiles' diff since the last audit,
  and `pnpm.onlyBuiltDependencies` in each `package.json`.

## 2. Prove before reporting

A finding is a reach shown with a planted hostile input — a vault file with a
`javascript:` link, a `../` or symlinked path argument, a pull request title
holding `$(…)` — in a scratch copy or as a failing test, never by reading
alone. A suspicion without that proof goes in a separate list with the
cheapest proof that would settle it.

## 3. Report

Verdict first: the count of confirmed findings and the most severe one in one
line. Then one row per finding, most severe first:

| # | Area | Input → reach | Guard today | Proof (command and output) | Severity | Fix slice |
|---|---|---|---|---|---|---|

Severity is reach times precondition: content-borne input that reaches code
execution, a secret, or a write outside the vault is critical; anything that
needs the person's own deliberate action is low.

## 4. Close the loop

- Each confirmed finding becomes a slice: a planned slice, an implementing
  agent, then `/merge` with the `security` lens. The fix ships with its
  planted input as a regression test, proven red on the unfixed code
  (`/gate-probe`), and that test joins `pnpm test:security`.
- A class of finding that could recur (a new raw-HTML sink, an unguarded path
  argument) becomes a gate only after `/gate-probe`'s inventory.
- A risk accepted rather than fixed is a decision record
  (`pnpm record:new -- --kind=decision`) with its falsifier; a change to the
  public threat model updates `SECURITY.md` in the same pull request.
- After the fixes land, rerun §0 and every planted input from this audit, and
  report each as blocked or still reached.

## Never

- Describe an unfixed, exploitable finding in a public issue, pull request, or
  commit before the fixed build ships. Ask the owner about a private GitHub
  security advisory; a fix pull request names the defect class, not the recipe.
- Read credential files, or scan outside this repository, to prove a point.
- Trust a gate because it is green.
