/**
 * The bounded brief for an unattended ontology refinement pass.
 *
 * A scheduled pass may keep the map's understanding current by measuring and proposing. It never
 * becomes the person who accepts meaning: the existing ACP writer card and MCP construction
 * lifecycle remain the only path to an ontology write or a meaning receipt.
 *
 * **A proposal names the finding it answers, so the reviewer can price it.** The MCP write door
 * already classifies body defects by a fixed code, and the person reading this packet is deciding
 * which proposals are worth a turn. A proposal carrying the code repairs something the tools
 * already measured; one carrying none is this pass's own judgement, and saying which is which is
 * cheaper than re-deriving it at review time.
 */

export interface OntologyRoundBriefInput {
  vaultRoot: string;
  locale: string;
  focus?: string;
}

export function buildOntologyRoundBrief({ vaultRoot, locale, focus }: OntologyRoundBriefInput): string {
  const focusLine = focus?.trim()
    ? `Keep this pass focused on: ${focus.trim()}`
    : 'Choose one bounded improvement area from the current evidence; do not attempt an exhaustive rebuild.';

  return [
    `This is an unattended Ontology refinement review for the folder ${vaultRoot}. Nobody is at the screen, so do not ask a question and do not wait for approval during this pass.`,
    `Use the connected atlas-vault MCP tools for the ontology and source evidence. Reply in ${locale}.`,
    '',
    'Read-only sequence:',
    '1. Call connection_info and query_ontology health or workspace_brief to establish the current graph and source-binding state.',
    '2. If connection_info.sameRoot is true, or the project source is unbound or not current, do not call index_project or analyze_repo_structure; report source-dependent claims as Unknown. If it is bound, use only the exact repository root returned by connection_info.',
    '3. Inspect a bounded set of relevant concepts, evidence paths, relations, and currentness gaps. Treat Unknown as a valid result.',
    `4. ${focusLine}`,
    '5. Return a review packet with: observed evidence, proposed ontology changes (if any), exact slugs or source paths, uncertainty, and the smallest human review action.',
    '6. When a proposed change answers one of the write-door findings, name which one: definition-missing, boundary-missing, uncertainty-missing, epistemic-exclusion, folder-only-evidence, or slug-outside-kind-folder. A proposal that answers none of them says so; do not attach a finding name to a change that does not repair it.',
    '',
    'Hard boundary:',
    '- Do not call add_concept, add_concepts, add_relation, add_relations, patch_concept, rename_concept, merge_concepts, delete_concept, reclassify_concept, or finalize_project_meaning.',
    '- Do not edit, create, rename, delete, or snapshot any file.',
    '- Use no shell, Python, grep, cat, filesystem API, or ACP tool-result/transcript path. If an MCP response is truncated or unavailable, use another atlas-vault read or report Unknown.',
    '- Do not claim that a proposal is accepted, qualified, executable, or finalized.',
    '- Do not turn a structural health result into a semantic approval.',
    '- End with `review-only` and a concise list of the next human review or ACP construction step.',
  ].join('\n');
}
