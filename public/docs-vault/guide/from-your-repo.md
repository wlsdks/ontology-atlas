# Starting from My Repository

No one manually enters a hundred nodes into an empty Vault. So, starting means **extracting from what you already have**. You already have code, folder structure,
and probably `CLAUDE.md` or `AGENTS.md`.

There are three entry points.

| What you have | Entry point |
|---|---|
| Code repository | `init --quick-start` (Sections 1 & 2 below) |
| Existing agent instruction file | `absorb` (Section 3) |
| Folder with Markdown documents | App's **Create Map from My Documents** (Section 4) |

**All three share one common rule: the proposal phase writes nothing.**
Only what you confirm enters the Vault.

## 1. Starting with One Line

```bash
node cli/src/index.mjs init my-vault --quick-start
```

What this one line does:

1. Create the vault folder and insert the start node.
2. **Scan the repository to create the first graph** (similar to `bootstrap` below).
3. Write the agent configuration file (`.mcp.json` · `.codex/config.toml`).
4. If `CLAUDE.md` or `AGENTS.md` exists, output only the lines **recommended for absorption**.
   It does not absorb automatically.
5. Output three lines of next steps.

Step 4 is important. The tool will never silently rewrite your hand-written instruction files.

## 2. View in parts: Scan · Verify · Apply

If one line feels uneasy, you can split it into three steps. **The first two steps do not touch the vault.**

### ① Scan: What are the candidates?

```bash
node cli/src/index.mjs analyze . --vault my-vault
```

Running this in the repository produces this output.

```
analyze /path/to/repo (framework=fsd)

  project     ontology-atlas — Ontology Atlas

  domains (5)
    domains/in-30-seconds          In 30 seconds       ← README.md
    domains/running-from-source    Running from source ← README.md

  capabilities (17)
    capabilities/guided-tour       Guided Tour         ← src/features/guided-tour
    capabilities/locale-switch     Locale Switch       ← src/features/locale-switch

  elements (45)
    elements/knowledge-graph       Knowledge Graph     ← src/entities/knowledge-graph
```

**The right arrow indicates the source.** Each candidate shows exactly where it came from, line by line.

What you can see here: The two domain candidates above were **extracted from the README title**. "In 30 seconds" is a document subheading, not your product's domain. This is why this step is a **proposal**. Scanning looks at structure and generates candidates; you know what is meaningful.

### ② Dependency candidates

```bash
node cli/src/index.mjs infer-imports . --vault my-vault
```

Read the TS/JS import graph to generate `depends_on` relationship candidates for "required items".

```
infer-imports /path/to/repo — 300 files / 714 edges / 273 external

  module edges (113) — depends_on candidates
    capabilities/project-edit —depends_on→ elements/project × 11 (static=11)
    capabilities/first-run-starter —depends_on→ capabilities/docs-vault-local × 6
```

`× 11` means there were actually eleven imports in that direction. Use `--threshold N` to filter out weak candidates.

### ③ Apply

Review it, and if you're satisfied, add `--apply`. To do both at once:

```bash
node cli/src/index.mjs bootstrap . --vault my-vault
```

`bootstrap` is simply scanning followed by import inference. It's no new magic. You can also create only nodes with `--skip-imports`.

## 3. Absorbing existing instruction files

If you already maintain files like `CLAUDE.md` · `AGENTS.md`, they already contain policies and decisions in text form. There is no reason to manage them as duplicates.

```bash
node cli/src/index.mjs absorb AGENTS.md --vault my-vault
```

**The default is dry-run.** It only outputs the plan without touching any files.

Add `--write` to:

- Rules · policies · decision clauses → become `kind: document` nodes.
- **Architecture · component clauses remain as proposals only**. Determining whether something is a capability, element, or domain requires human judgment, so it is not written automatically.
- Clauses suspected of injection are excluded from absorption regardless of classification.
- The original is backed up as `<file>.pre-absorb.bak`, then rewritten as a **thin pointer preserving the unabsorbed clauses exactly**.

The last line is this command's contract. **Content is never destroyed.**

## 4. In apps: Folders that already have documents

Even without `kind:` frontmatter, opening a folder containing markdown causes the map to report the **number of documents found** instead of saying "0 concepts," and proposes "Create map from my documents."

Clicking it generates candidates from the already-scanned list.

| Found | Candidate |
|---|---|
| Root `README` | Project name |
| Step 1 subfolder | Domain |
| Each document | Element with `domain:` |

Upon approval, **only the approved documents get frontmatter**; the body remains untouched. This creates a single new `project.md`. That's all.

## 5. Let an AI Agent Do It

If you've already connected an agent ([Connect an AI Agent](/guide/connect-agent)), you can just tell it what to do. The tools the agent uses are **the same** as the CLI.

- `analyze_repo_structure`: Scans the repository to propose candidates.
- `infer_imports`: Proposes "required items" from the import graph.
- `index_project`: Combines both into a plan with verification.

The agent's advantage comes next. To know "what this folder does," you must read
the code, not just the folder name. Agents can read code, so they produce names
that describe the role rather than literal folder names like `Locale Switch`.

## 6. Auto-generated Items Are Just Skeletons

Leaving the scan results as-is means you've only **transcribed the folder structure into Markdown**. That's not a map; it's a `tree` output. The essential next steps:

1. **Rename by role.** `Docs Vault Local` is a folder name, not what it does.
2. **Add evidence.** For capabilities, the `path:` initially points to an implementation entry point unfamiliar to the agent. The `elements:` field should contain only actual element node slugs with distinct roles, not file paths.
3. **Add semantic relations.** Mere containment is a tree; you need `relates` and `dependencies` for a graph.
4. **Check incomplete areas.**

```bash
node cli/src/index.mjs maintenance my-vault
node cli/src/index.mjs health my-vault
```

[What Becomes a Node](/guide/what-becomes-a-node) covers what to make into nodes and what not to; [After the Vault Grows](/guide/growing-vault) handles the cleanup after growth.

## Summary

- Start by **extracting from what you have**. You don't need to manually list a hundred items.
- `analyze` and `infer-imports` **do not touch the vault**. Read first, then `--apply`.
- The arrow next to the candidate is the **evidence**. If the evidence is off, so is the candidate.
- `absorb` defaults to dry-run; `--write` also preserves content after backing up the original.
- **Auto-generated items are skeletons.** Names, evidence, and semantic relations are filled in later by humans (or agents).
