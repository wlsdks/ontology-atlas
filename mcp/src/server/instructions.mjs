/**
 * The MCP `instructions` string carried in the `initialize` response, with the
 * live tool inventory left as a placeholder `registry.mjs` fills in.
 *
 * Section order is load-bearing: a host may keep only the first 2,048 characters,
 * so the identity line and construction card come first, and everything a
 * truncating host drops stays reachable through `connection_info({guide})`.
 */

import { CONSTRUCTION_CARD_EN } from '../construction/construction-card.mjs';

// The host decides whether this reaches model context and may cut it at 2,048
// characters, so it carries only what a first call needs; every long rule is a
// `connection_info({guide})` topic and every tool's contract is its description.
const TOOL_INVENTORY_PLACEHOLDER = '__ONTOLOGY_ATLAS_ACTIVE_TOOL_INVENTORY__';

// The two guide topics below live here because nothing else in the server
// needs them; `connection_info({guide})` hands them back verbatim.
const WORKFLOWS_SECTION_EN = `## Starting a known coding task

1. \`connection_info\` \u2014 prove the resolved vault and repository roots.
2. \`query_ontology({operation:'agent_brief',project:'SLUG'})\` \u2014 receive the project's currentness, its readiness and the nodes to read first. Then \`get_concepts({slugs:[...], body:'full'})\` for the nodes it names: the body is where the definition, \`## Includes\`, \`## Excludes\` and \`## Uncertainty\` live.
3. Read the code those nodes cite with \`read_source\` in one batch before any repository inventory or broad search. Add named positive and negative regression tests with exact observable output, run the focused check once, then the full check once without overlapping test runs. Broaden only when source contradicts what the node says.
4. Do not call \`workspace_brief\` or \`list_concepts\` first; those are for whole-vault orientation.`;

const WRITE_SAFETY_SECTION_EN = `## Write tools — safety patterns

- **Every destructive dry-run** returns the same decision contract: \`previewReady\` says the preview is complete, \`wouldChange\` says confirmation would mutate disk/Git, \`canConfirm\` says the exact reviewed call is safe to repeat with \`confirm:true\`, and \`blockedReasons[]\` explains every remaining gate. Decide from these fields rather than the legacy \`ok\` flag, which describes operation-specific success.
- **\`add_concepts\`** fails a row whose slug exists — use \`patch_concept\` to update an existing node, never delete-then-add (that loses backlinks).
- **\`remove_relation\`** (with \`replaceWith: {to, type, why}\` it replaces the relation) **and \`rename_concept\` with \`newKind\`** (it changes the kind) are dry-run by default and require \`confirm: true\` to write. They preserve rationale/backlinks atomically and should replace manual whole-array frontmatter surgery.
- **\`rename_concept\` / \`merge_concepts\`** are dry-run by default. The first call returns an \`updates\` preview (every affected file's before/after). To commit, repeat the call with \`confirm: true\`. \`rename_concept\` refuses an existing \`newSlug\` unless you intentionally pass \`overwrite: true\`. Backlinks are redirected atomically — much safer than \`patch_concept\` + N \`find_backlinks\` loops.
- **\`delete_concept\`** refuses by default if any backlinks remain. That refusal is a plain error and carries nothing back — the node is simply untouched. Only a delete that actually ran returns \`captured\` with the removed frontmatter and body, which is the copy to keep if you may need to restore it. Pass \`force: true\` only after confirming with the user that dangling referrers are acceptable.
- **Git** is your own: this server has no Git tools. Read the vault's changes with \`git -C <repoRoot> status -- <vault>\` and \`git -C <repoRoot> log -- <vault>\` (\`connection_info\` names both paths), and commit them yourself after \`validate_vault\`. Tool annotations are hints; the runtime guards of the write tools are authoritative.
- **\`absorb_document\`** (Slice 0 — the "absorption tool") converts a CLAUDE.md/AGENTS.md-style file into typed vault nodes. Dry-run by default (plan only); \`confirm: true\` writes rule/policy sections as \`kind: document\` (\`role: policy\`) nodes, backs up the source to \`<file>.pre-absorb.bak\`, and rewrites it into a slim pointer that preserves every non-absorbed section (architecture/component suggestions, unclassified prose, and injection-suspect sections) verbatim. If the canonical source path is outside \`repoRoot\` (including an inside-repo symlink that resolves outside), confirmation is blocked until the caller explicitly passes \`allowOutsideRepo:true\` after reviewing the absolute path. Architecture/component sections are reported as candidates only — never auto-written; land them yourself with \`add_concepts\` if useful.
- **\`expected_mtime\` (existing-node write tools)** — to guard against concurrent edits by the human or another agent: capture \`mtime\` from \`get_concepts\`, pass it as \`expected_mtime\` on the next write. If the file changed in between, the call throws \`VaultConflictError\` instead of silently overwriting. For \`merge_concepts\`, also pass the survivor's mtime as \`expected_into_mtime\`; both identities can otherwise race.
- **\`finalize_project_meaning\`** is the post-write boundary for project competency answers. Call it only after accepted concept/relation writes, \`validate_vault\`, and a complete compile. It derives current body/graph/source provenance itself and stores no raw answers or private source coordinates; \`ok:true\` means the receipt was written, while the returned categorical \`meaningAssessment\` remains fail-closed when source currentness cannot be checked.
- **\`connect_project_source\`** binds the local code folder a project node describes; \`disconnect_project_source\` unbinds it. When \`agent_brief.projectSource.nextAction\` says \`connect_source\`, \`repair_source_binding\`, \`measure_source\`, or \`remeasure_source\`, this is the call that performs it — \`agent_brief.projectSourceRemedy\` hands you the exact arguments. Omit \`rootPath\` and the server infers the folder (the git repository enclosing the vault, else the nearest ancestor project manifest); the default dry-run reports the candidate and how many declared \`path:\` claims resolve inside it before you pass \`confirm:true\`. Never guess an absolute path for the user — run the dry-run and let them see the folder. The absolute root stays in the gitignored vault sidecar and never enters a receipt or handoff.`;

const SERVER_INSTRUCTIONS_TEMPLATE = `ontology-atlas — markdown vault where each \`.md\` with a frontmatter \`kind:\` is one ontology node.

${CONSTRUCTION_CARD_EN}

The graph encodes the codebase's mental model and is shared with the human via plain markdown.

${TOOL_INVENTORY_PLACEHOLDER}

## Which tool answers which question

The vault preserves recorded meaning, rationale, boundaries, and uncertainty.
Source can provide evidence of implemented rules and behavior; original intent
may also require current documents or the owner's judgment. For an existing
meaning question, read the node body first, then verify relevant source evidence
without treating either a stored claim or a code path as complete proof.

- *"What is X? Why is this boundary drawn here? What was decided, and why?"* \u2192 \`get_concepts({slugs:[X], body:'full'})\`, then read the body \u2014 its definition, \`## Includes\`, \`## Excludes\` and \`## Uncertainty\`. That is where reasons live.
- *"What does X contain / belong to?"* \u2192 \`get_concepts\`, then \`query_ontology({operation:'neighbors', slug:X})\`.
- *"Who references X?"* (always before a rename, merge, or delete) \u2192 \`find_backlinks({slug:X})\`.
- *"How are A and B related?"* \u2192 \`query_ontology({operation:'path', from:A, to:B})\` \u2014 each edge's \`via\` names the frontmatter key that linked them.
- *"What breaks if I change X?"* \u2192 \`query_ontology({operation:'impact'})\`, then \`blast_radius\` for the same answer grouped by kind and domain.
- *"Which nodes match a condition?"* \u2192 \`list_concepts({filter})\`; *"which nodes mention a word?"* \u2192 \`list_concepts({mentions})\`.
- *"How big is the vault, and of which kinds?"* \u2192 \`list_concepts({limit:1})\` and read \`census\`.
- *"Where do I start? Is this vault trustworthy?"* \u2192 \`query_ontology({operation:'workspace_brief'})\`, then \`validate_vault({})\`.

## Node identity

Every valid node has both identities: immutable \`uid\` is the permanent machine identity, while \`slug\` is the current human-readable address. \`list_concepts\`, \`get_concepts\`, compiled/query node rows, and agent handoffs return both. Use \`get_concepts({uids:[...]})\` for exact continuity across renames; use slug for frontmatter relations, URLs, and all graph-operation inputs. Never treat a slug change as a new UID.`;

export {
  TOOL_INVENTORY_PLACEHOLDER,
  SERVER_INSTRUCTIONS_TEMPLATE,
  WORKFLOWS_SECTION_EN,
  WRITE_SAFETY_SECTION_EN,
};
