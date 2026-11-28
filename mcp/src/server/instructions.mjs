/**
 * The MCP `instructions` string carried in the `initialize` response: the
 * identity line, the construction card and one line to `connection_info({guide})`.
 * A host may keep only the first 2,048 characters, so the whole string fits
 * inside them; `tools/list` already carries the tool inventory and every
 * long rule is a guide topic.
 */

import { CONSTRUCTION_CARD_EN } from '../construction/construction-card.mjs';

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
- **\`connect_project_source\`** binds the local code folder a project node describes; \`disconnect_project_source\` unbinds it. When \`agent_brief.projectSource.nextAction\` says \`connect_source\`, \`repair_source_binding\`, \`measure_source\`, or \`remeasure_source\`, this is the call that performs it — \`agent_brief.projectSourceRemedy\` hands you the exact arguments. Omit \`rootPath\` and the server infers the folder (the git repository enclosing the vault, else the nearest ancestor project manifest). Without \`confirm:true\` it only reports the candidate and how many declared \`path:\` claims resolve inside it; where a person approves every write, the approval names the folder and that one call writes (\`confirm:false\` still previews). The answer is \`status\`, \`nextAction\` and \`topGap\`; the receipt and the absolute root stay in the gitignored vault sidecar.`;

const SERVER_INSTRUCTIONS = `ontology-atlas — markdown vault where each \`.md\` with a frontmatter \`kind:\` is one ontology node.

${CONSTRUCTION_CARD_EN}

More: \`connection_info({guide})\`; \`tools/list\` names every tool.`;

export {
  SERVER_INSTRUCTIONS,
  WORKFLOWS_SECTION_EN,
  WRITE_SAFETY_SECTION_EN,
};
