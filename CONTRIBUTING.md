# Contributing to ontology-atlas

Welcome. We aim to keep contributing as low-friction as possible. This
project is built around the idea that *humans and AI agents are equal
contributors to a shared mental model*. That belief shapes how we run
the repo too — both humans and AI tools (Claude Code, Cursor, Aider,
Copilot, ...) read [`AGENTS.md`](AGENTS.md) for canonical contributor
guidance.

## TL;DR

```bash
git clone https://github.com/wlsdks/ontology-atlas
cd ontology-atlas
pnpm install
pnpm dev                          # http://localhost:3000

# Before opening a PR
pnpm exec tsc --noEmit
pnpm test:run
pnpm lint
pnpm build                        # static export
```

> Contributor-facing repository guidance is canonical in English. Localized
> product data remains in its locale-specific fields and templates.

## Ways to contribute (no code required)

The most valuable contributions today:

1. **Scaffold a vault and tell us what's confusing** — from a source
   checkout, `node cli/src/index.mjs init ./ontology` inside your own
   repository (see the root README's quick start). File an issue with
   what you tried and where you got stuck.
2. **Bring your own vault** — point the workbench `/docs` picker at a
   real codebase ontology you maintain. Tell us what missing tools or
   visualizations would change your day.
3. **Audit `docs/ontology/`** — our dogfood vault. Open a PR that
   improves a domain's frontmatter, or rewrites a confusing capability
   description.

Non-code issues: use [GitHub Issues](https://github.com/wlsdks/ontology-atlas/issues)
with the `frontmatter-ergonomics` / `mcp-tools` / `view-perf` /
`onboarding` labels (suggest one in your issue title if no label fits).

## Code contributions

### Fork first — this is a security boundary, not a formality

**Open pull requests from a fork**, not from a branch in this repository.

This repository is public and its release workflow holds Apple signing and
notarization credentials. GitHub does not pass secrets to workflows triggered by
a fork, so a pull request from a fork **cannot reach them** — that protection
only exists as long as contributions arrive that way. Anyone who can push a
branch here can change a workflow that runs on push, and therefore can reach the
credentials.

So the fork is doing real work: it is why we can accept changes to CI from
strangers at all.

```bash
# Fork on GitHub, then:
git clone https://github.com/<your-username>/ontology-atlas
git remote add upstream https://github.com/wlsdks/ontology-atlas
```

Workflows on fork pull requests wait for maintainer approval before running.
That is expected — it is not the CI being broken.

`tests/contract/workflow-security.contract.test.ts` enforces the rules this
depends on (no `pull_request_target`, no secrets in pull-request workflows, no
untrusted strings in shell commands). See [`SECURITY.md`](SECURITY.md) for the
full picture and for how to report a vulnerability.

### Branch & commit

- Branch: `feat/...`, `fix/...`, `refactor/...`, `chore/...`, `docs/...`.
  Don't push to `main`.
- Commits: conventional English prefix and English body. Explain the *why* —
  the diff explains the *what*. Do not invent custom prefixes.
- Don't bypass git hooks (`--no-verify`).

### Verification before PR

```bash
pnpm exec tsc --noEmit          # 0 errors
pnpm lint                       # 0 errors (warnings OK to keep)
pnpm test:run                   # all unit + component tests pass
pnpm exec playwright test       # if you touched user-facing flows
pnpm build                      # static export must succeed
```

### PR body template

A short PR is fine. We expect:

- **Summary** (2-3 lines or a short bullet list)
- **Test plan** (how you verified — paste command output if relevant)

For design changes, attach before/after screenshots in both light and
dark modes (the design system is dark-first but light-mode tokens exist).

### Architecture rules (enforced)

We use [Feature-Sliced Design](https://feature-sliced.design/) with
ESLint boundaries. Import direction: `app → views → widgets → features →
entities → shared`. Reverse direction is blocked at lint time.

**`@/entities/<x>` barrel must not re-export server / cloud API
functions.** R10b removed all `entities/<x>/api/` folders (cloud Firestore
clients), but the lint rule remains as a precaution — if a future
cloud-collab phase reintroduces server APIs, the barrel must stay clean
so first-paint chunks of local-first routes don't pull them in. See
[`.claude/rules/architecture.md`](.claude/rules/architecture.md) for the
full rule.

## Mission v3 alignment

If a feature/route/widget would conflict with mission v3 — **"one
codebase, one ontology, that the developer and their AI agent grow
together"** (R12, 2026-05) — please flag it in your PR. We've spent
significant effort cleaning up v1 LLM extraction / TBox / cloud-only
patterns; we want to avoid quietly re-introducing them. Earlier mission
v2 wording ("vault frontmatter = graph, MCP partner, local-first") still
holds — v3 sharpens *who* the partner is (developer + their AI agent;
PM/designer surface is bonus, not target).

The 1-line gate question:
*"Does X contradict the spine (vault frontmatter), partner (developer +
AI agent via MCP), or self-approval (no review queue) flow?"* — if yes,
please open a discussion before code.

## Working with AI agents in this repo

This repo is designed to be safely worked on by AI coding agents. If
you're an AI agent reading this:

- Read `AGENTS.md` first.
- All `.claude/rules/*.md` are your contributor rules. They auto-load in
  Claude Code.
- The dogfood vault at `docs/ontology/` is your context map for the
  project — read it as you would explore a codebase.

## Code of conduct

Be kind. Assume good intent. Disagree on code, not on people.
Korean and English are both first-class languages here.

## License

By contributing, you agree your work is licensed under MIT (the project's
license).
