---
title: Starting from My Repository
doc_type: guide
status: current
area: agents
---

# Starting from My Repository

Start with one question you want your codebase to answer: **“How does an order
get accepted, and where would I check before changing that rule?”** A useful
first map preserves that answer, its source evidence, and what is still unknown.
You can grow it after reviewing this first slice.

**Checked against v1.6.0 on October 5, 2026.** In this version, repository scans
produce review candidates. `bootstrap` does not write repository-derived nodes;
`analyze --apply` writes nothing, and `infer-imports --apply` is disabled. Creating
a starter folder, reviewing a proposal, and accepting its meaning are separate
steps.

## 1. Choose your starting point

| What you have | Where to start | What to expect |
|---|---|---|
| The installed macOS app and a coding agent | Create or open a vault, then [connect the agent](/guide/connect-agent) | The app bundles MCP; no Atlas source checkout is needed for that connection |
| A code repository and a terminal | Follow Sections 2–3 | A local `atlas/` folder, starter documents, and agent configuration |
| An agent already connected to the right vault | Use the prompt in Section 4 | An evidence-backed proposal for a small part of your product |
| Markdown documents or existing agent instructions | See Section 8 | Document candidates or a preview of instruction absorption |

Atlas and the agent read the same Markdown folder. Opening it in Atlas does not
upload your repository to an Atlas backend. A connected coding agent uses its
own provider and data settings.

## 2. Set up the CLI once

The commands below need **Git, Node.js 24, and pnpm**. The CLI runs from the Atlas
source checkout; there is no `npx ontology-atlas` package. Keep the tool checkout
outside the repository you want to describe.

Run these commands in your terminal:

```bash
mkdir -p "$HOME/tools"
git clone --branch v1.6.0 --depth 1 https://github.com/wlsdks/ontology-atlas "$HOME/tools/ontology-atlas"
cd "$HOME/tools/ontology-atlas"
pnpm install --frozen-lockfile
pnpm --dir mcp install --frozen-lockfile
ATLAS_CLI="$HOME/tools/ontology-atlas/cli/src/index.mjs"
```

Both install commands are needed: `mcp/` has its own lockfile. This example pins
the checked release. If you already have an Atlas checkout, use its absolute CLI
path instead of cloning over it; a newer checkout may have newer behavior.

`ATLAS_CLI` lasts for this terminal session. In a new terminal, set it again.

## 3. Create the vault inside your repository

Replace `/absolute/path/to/your-repository` with the folder containing **your
code**, then run:

```bash
cd /absolute/path/to/your-repository
node "$ATLAS_CLI" init ./atlas
node "$ATLAS_CLI" mcp-verify ./atlas
```

`init` writes starter Markdown, agent configuration, and starter skills. The
starter examples give you a shape to work with; they are not an analysis of your
product. Review the resulting changes in `git diff` before committing them.
If you already have a vault, keep it and use its path instead of creating another.

`mcp-verify` starts a server and checks that it can answer real queries. It does
not prove that a running agent has loaded the configuration. **Restart your
coding agent from your repository**, then ask:

> Call `connection_info`. Show the resolved vault and repository paths, and
> confirm which folder contains the code we are about to read. Do not write yet.

The vault should resolve to your repository's `atlas/` folder; the repository
should resolve to your code root. They normally differ. If either is wrong,
repair the connection before continuing.

## 4. Ask the agent for one useful slice

Use a coding agent that can read your repository and call Atlas MCP. The app's
internal vault conversation does not have the repository-analysis tools.

Copy this prompt and replace the bracketed goal with a real behavior in your
product, such as “accept an order” or “publish a document”:

```text
Help me build the first useful Atlas map of this repository.
Focus on [one product behavior I want to understand].

First confirm the vault and repository with connection_info. Read list_kinds,
narrow list_concepts, and the full bodies of any relevant existing concepts so
we do not duplicate them. Treat starter examples as examples, not product facts.

Read the actual entry point, important conditions, failure paths, and relevant
callees. Use source and current documentation as evidence. Do not turn folders,
README headings, or import counts into accepted product concepts.

Propose a small batch in plain language before writing. For each concept, show
what it means, what it includes and excludes, its exact implementation evidence,
and what you could not verify. For each relation, explain why it holds and any
condition that limits it. Keep unsupported conclusions unknown.

Stop so I can correct, reject, or approve the exact proposal. After approval,
write only the selected concepts and relations, validate and compile the vault,
preview the project source binding, and finalize the accepted project meaning.
Report remaining gaps separately from successful writes.
```

For a first pass, a handful of concepts is enough. Ask for the shortest map that
answers your question. More nodes can wait until you need another answer.

## 5. Review meaning before saving it

A good proposal lets you disagree with a specific claim. Here is an
**illustrative** order example, not output from your repository:

| Proposed concept | Useful meaning | What the evidence must support |
|---|---|---|
| Order acceptance (capability) | An eligible request becomes an accepted order | Entry point, eligibility checks, accepted result, and refusal paths |
| Stock reservation (element) | Holds stock while the order is being accepted | The implementation's role, its conditions, and what happens when reservation fails |
| Order acceptance depends on stock reservation | Acceptance requires reservation in the named flow | The caller and branch showing that requirement; an import alone is insufficient |

Before approving, check these points:

- **Can you explain it?** The name describes a product ability or implementation
  role. A folder name or a technology name by itself tells you too little.
- **Can you challenge it?** The body states a definition, included and excluded
  responsibilities, and uncertainty. “We did not read this” is an uncertainty,
  not a product exclusion.
- **Can you verify it?** Implementation claims lead to an actual file and the
  relevant behavior, including its conditions. A path's existence alone does
  not prove the explanation.
- **Does the relation hold?** Ask whether the ability can still succeed when the
  target is skipped, disabled, or replaced. Keep that condition in the rationale.

You can reply, for example: “Keep order acceptance. Rename stock reservation to
match its actual role. Leave the payment dependency unknown until you read that
branch. Show the revised proposal before writing.” Approve the revised content
you actually saw.

Small reviewed batches use the ordinary MCP writers. A bulk
`analyze_repo_structure` write plan has a separate qualification lifecycle:
independent evaluation, the exact review plan and gaps, human acceptance, and
an unchanged released `writePlan`. If that evaluation is unavailable, continue
with small explicitly approved batches; the builder must not invent an evaluator.

## 6. Open the map and check the answer

Open **your repository's `atlas/` folder** in Atlas. The app is another reader of
the files the agent wrote; it does not need a separate import of the graph.

After the approved writes, ask the agent to:

1. Run `validate_vault` and `compile_ontology` and report errors and warnings.
2. Preview `connect_project_source` for the project. Review the proposed code
   folder before confirming the binding.
3. Run `finalize_project_meaning` and report the returned assessment and gaps.

Then try answering your original question from the map and full node bodies.
You should be able to explain the behavior, find its implementation starting
point, and distinguish declared dependencies from unknown impact. If you
cannot, ask for the missing explanation before expanding the map.

**Validation success means the documents and graph passed those checks.** A
saved receipt or a large graph does not establish complete or accepted meaning.

## 7. Preview repository evidence from the terminal

These are optional inspection commands. Run them from your code root, using the
CLI path from Section 2:

```bash
node "$ATLAS_CLI" analyze . --vault ./atlas
node "$ATLAS_CLI" infer-imports . --vault ./atlas
node "$ATLAS_CLI" bootstrap . --vault ./atlas
```

`analyze` proposes structure candidates. `infer-imports` reports observed code
imports. `bootstrap` combines them into a review-only plan; **exit code 3 means
approval is required, and no repository-derived meaning was written**.

The number of imports is evidence of code use, not a score of business importance
or proof of a `depends_on` relation. `--threshold N` filters candidates for
review; it does not approve them.

`init ./atlas --quick-start` also exists, but it creates the scaffold **before**
running this review-only bootstrap. It can therefore leave starter files and
configuration while returning exit code 3. It is not a one-command completed map.

## 8. Reuse documents you already have

**A folder of Markdown documents:** open it in Atlas. When untyped documents are
found, the map offers **Build the map from my documents**. Review the candidates:
folder and document names are starting suggestions. Approval adds frontmatter
to selected documents while retaining their bodies, and creates or updates the
project document. This does not inspect your repository's implementation.
Agent/runtime files and the Library's `sources/` and `wiki/` are excluded.

**An existing `AGENTS.md` or `CLAUDE.md`:** preview absorption from your code root:

```bash
node "$ATLAS_CLI" absorb AGENTS.md --vault ./atlas
```

The default is dry-run. Review the plan before repeating it with `--write`.
That write backs up the original as `<file>.pre-absorb.bak`, creates document
nodes for the policy sections in the plan, and replaces the instruction file with a
thin pointer preserving unabsorbed sections. Architecture sections remain
proposals; suspected injection content is not absorbed. This rewrites an agent
instruction file, so inspect both the backup and the resulting diff.

## 9. If you get stuck

| What you see | What to do next |
|---|---|
| `cli/src/index.mjs` cannot be found | Use the absolute `ATLAS_CLI` path; run it from your own repository |
| MCP dependency preflight fails | Run `pnpm --dir mcp install --frozen-lockfile` in the Atlas checkout and retry |
| `approval_required` or bootstrap exit code 3 | Read the candidates, then continue in the connected agent with Section 4 |
| The agent answers from Atlas's own project | Check `connection_info`; run setup from your repository and restart the agent |
| Existing agent config cannot be merged | Inspect the reported adjacent example; repair the config without replacing unrelated servers |
| The map contains starter examples | They are scaffolding. Have the agent identify them and propose reviewed replacements |
| Validation passes, but the explanation is weak | Read the node body and source together; correct meaning and uncertainty before adding nodes |

Next, use [What Becomes a Node](/guide/what-becomes-a-node) to sharpen the concepts,
[Relations](/guide/relations) to judge the links, and
[After the Vault Grows](/guide/growing-vault) to keep the map useful as code changes.
