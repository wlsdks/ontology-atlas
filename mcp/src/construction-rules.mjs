/**
 * Ontology construction rules — the SINGLE source for every channel that tells an
 * LLM how to build this graph.
 *
 * ## Why this file exists (2026-07-31 council)
 *
 * This repo's own vault grew a `capability` with **92 direct `elements:`** that is
 * byte-identical to `ls cli/src/commands/`. The council's first instinct — cap the
 * fan-out at 12 — was retracted by every seat that proposed it. Three findings
 * killed it:
 *
 * 1. **Count is the wrong target.** `schema.org`'s `CreativeWork` has 39 direct
 *    subtypes (75 by a wider count) and a committee has maintained that for 15
 *    years. The OOPS! catalogue of 693 ontology pitfalls has no "too many
 *    siblings" entry. What separates a healthy 39 from our sick 92 is not the
 *    number — it is whether siblings are **mutually non-substitutable**.
 *    Article/Book/Recipe/Movie are; "yet another subcommand" ×92 is not.
 *
 * 2. **A cap is gameable, and the weaker the model the more it games.** Told
 *    "split anything over 12", a model creates two empty buckets named "Group A"
 *    and "Group B", moves half the children into each, and passes. Information
 *    stays at zero while the metric goes green. A rule that can be satisfied
 *    without understanding is worse than no rule — it manufactures false
 *    confidence.
 *
 * 3. **The rules were aimed at the wrong door.** The 92 did not arrive through
 *    `add_concept`; they accumulated through repeated `patch_concept`, and
 *    `patchFrontmatter`/`updateDoc` in `vault.mjs` normalize values but emit **no
 *    warnings at all**. Guidance placed on the creation path never met the growth
 *    path. (Verified in source, not assumed.)
 *
 * ## The three layers, and why none of them is optional
 *
 * | Layer | What lives there | Failure if it stands alone |
 * |---|---|---|
 * | **Values** | thresholds, this file's constants | a number with no meaning attached |
 * | **Gate logic** | `vault.mjs` write primitives (shared by add/patch/relate) | the model never learns *why* |
 * | **Text** | `SERVER_INSTRUCTIONS`, tool descriptions, chat system prompt | dies silently, like `missing-expected-field` |
 *
 * ## Language boundary — deliberate
 *
 * Everything in this file is **English only**. These strings are read by models,
 * and the project is open source. Text a *person* reads on screen is a different
 * channel: it lives in `messages/ko.json` / `messages/en.json` keyed by issue
 * code, and must never surface these English originals verbatim.
 *
 * ## Consumers — and why one of them CANNOT import this
 *
 * - `mcp/src/index.js` → **imports** this module; `SERVER_INSTRUCTIONS` and the
 *   `add_concept` description interpolate these constants. Same package, so this
 *   is a real single source.
 * - `src/features/vault-agent/model/system-prompt.ts` (the in-app agent chat on
 *   the user's own API key) → **literal duplicate.** `mcp/`, `cli/`, and `src/`
 *   are separate packages with zero cross-imports (verified: `grep` finds none,
 *   each has its own `package.json`). Importing across them is not possible, so
 *   the repo's existing convention applies — the same convention that already
 *   keeps `mcp/src/schema.mjs` and `cli/src/lib/schema.mjs` byte-identical:
 *   **duplicate the literal, and let a contract test forbid divergence.**
 *
 * A first draft of this comment claimed the chat panel imports the constant.
 * It cannot. Writing "single source" over a duplicate does not make it one —
 * only the gate does.
 *
 * ## Status (2026-08-02)
 *
 * The **gate-logic half is now wired**: `mcp/src/vault.mjs` imports
 * {@link looksLikePath} and the message builders below from this module, and it
 * runs them inside the one write primitive that `add_concept`, `patch_concept`,
 * and `add_relation` all pass through. So for the code-defense channel this file
 * is a real source of truth — `mcp/src/write-path-gate.test.mjs` fails if a door
 * routes around it, and `tests/contract/vault-schema.contract.test.ts` fails if
 * the two packages' thresholds drift.
 *
 * The **prompt half is wired too**: `CONSTRUCTION_RULES_EN` is interpolated into
 * `SERVER_INSTRUCTIONS`; the naming rules are appended to the single/batch tool
 * descriptions; and the in-app chat carries the construction rules plus
 * `CHAT_RULES_DELTA_EN`. `construction-rules.contract.test.ts` proves the MCP
 * import path, while `vault-schema.contract.test.ts` proves the app's necessary
 * literal copy stays byte-aligned with this canon.
 */

/**
 * The procedure an LLM follows before adding a child to a parent.
 *
 * Written as **steps, not judgement**. "Build a good ontology" only works on
 * strong models; a weak model needs "if X, answer these three questions, and if
 * the answer is Y call this tool this way". Every rule here that could not be
 * reduced to a procedure was pushed down into the gate logic instead — that
 * demotion is the actual answer to "it must work on non-frontier models".
 *
 * Note step 5: the procedure **never blocks a write**. Blocking would make the
 * vault feel hostile and would push agents to work around the tool. The gate
 * reports; the human and the maintenance queue decide.
 */
import {
  NODE_ELIGIBILITY_GATE,
  ONTOLOGY_META_MODEL_REFERENCE,
  VAULT_KIND_SCHEMA,
} from './schema.mjs';

/**
 * Compact offline-safe boundary shared by the source/bundled MCP prompt and
 * the in-app vault agent. The full examples and counterexamples live in the
 * public specification; this block keeps only the facts a model needs at the
 * decision point when that document is unavailable.
 *
 * `src/` cannot import `mcp/`, so the app carries a literal mirror guarded by
 * `tests/contract/ontology-meta-model.contract.test.ts`.
 */
export const META_MODEL_RULES_EN = `## Meta-model truth boundary

Canonical kind, relation, and inference contract: ${ONTOLOGY_META_MODEL_REFERENCE}

Atlas has five authorable kinds: project, domain, capability, element, and
document. \`vault-readme\` is a reserved reader kind generated by Atlas; never
author it. A folder, package, team, workflow, technology, or README heading is
observed evidence, not automatically a domain or capability. A bare path is
evidence for an element role, not a concept by itself.

Direct \`is_a\` is an application-level subsumption claim. The stored key is
\`broader:\`: narrower → direct broader, displayed by the UI as \`is_a\`. Both
endpoints must be the same authorable kind among domain, capability, or element.
Every valid example of the narrower must satisfy the broader definition, and no
known intermediate concept may fit between them. Same domain, name similarity,
and folder nesting are not \`is_a\` evidence; neither are instance/member,
part/containment, dependency, sequence, or synonym claims.

\`broader\` is validated as frontmatter and rendered by the UI, but it is not an
accepted public \`add_relation\` or relation-query enum in the current MCP
contract. To change it safely, call \`get_concept\`, capture \`mtime\`, build the
full post-change \`broader\` array, call \`patch_concept\` with \`expected_mtime\`,
then call \`validate_vault\`. Do not invent an \`add_relation(type:"is_a")\` call.

Atlas performs no automatic inverse or transitive inference. Missing relations
are unknown/visible gaps, not falsehoods or proof of completeness. Atlas Markdown
is not an RDF serialization, OWL reasoner, SKOS implementation, or SHACL processor;
the product makes no RDF, OWL, SKOS, or SHACL conformance claim.`;

export const CONSTRUCTION_RULES_EN = `## Construction rules — read before add_concept / add_concepts / patch_concept

1. BEFORE adding a child to a parent, call get_concept(parentSlug) and read \`neighbors\`.
2. Count the parent's children that RESOLVE to real vault nodes — an entry that
   resolves to nothing is evidence, not a child, and does not count. Compare that
   against this vault's own distribution (list_kinds /
   query_ontology({operation:'facets'})). Until the vault has enough parents of
   that kind to have a distribution, use this starting range: about ${NODE_ELIGIBILITY_GATE.BOOTSTRAP_FANOUT_TRIGGER.domain_to_capability} capabilities
   under a domain, about ${NODE_ELIGIBILITY_GATE.BOOTSTRAP_FANOUT_TRIGGER.capability_to_element} elements under a capability. Crossing that is a
   TRIGGER for step 3 — NOT a limit. There is no maximum number of children,
   crossing it is not a defect, and it never blocks a write.
3. When triggered, answer before writing:
   a. Can you write ONE non-circular sentence why the new child is NOT interchangeable
      with an existing sibling? If you cannot, patch_concept the existing sibling's
      body instead of creating a new node. THIS IS THE TEST — the other two are hints.
   b. Is the candidate title a file/import path rather than a concept name? A path is
      EVIDENCE of a concept, not the concept — do not create one node per file unless
      each file's role differs in a sentence you can actually write.
   c. Do several existing children share a name/path prefix? Glance at them, but do
      NOT treat this as the condition — prefixed siblings are often legitimate, and
      broken ones often share no prefix. It only tells you where to look first.
4. IF (a) fails for 3+ existing children, the fix is a BRIDGE NODE: one node inserted
   between the parent and those children, named after the behavior they share. Call
   add_concept ONCE for it, then patch_concept each matching child to point at it.
   Create a bridge only when all four hold:
   i.   It names a shared BEHAVIOR. "Group A" / "Part 2" / "Other" divide the pile
        without adding meaning — those are not bridges, they are empty buckets with
        a name on them.
   ii.  You can state that behavior in ONE sentence. If you cannot write the
        sentence, you have not found the grouping yet.
   iii. The bridge itself passes (a) against its own siblings — a bridge that is
        interchangeable with an existing node is a duplicate, not a layer.
   iv.  You actually reparent the children afterwards. A bridge left empty IS the
        empty bucket it was meant to prevent, and it does not go unnoticed: a node
        that groups nothing is reported for retirement.
   IF you cannot satisfy all four: create NOTHING — count alone is not evidence of
   a problem.
5. This procedure does not block writes. Skipping it still succeeds; \`warnings\` /
   \`postWriteMaintenance\` on the response flags it for cleanup instead.
6. When you create a \`capability\`, attach its EVIDENCE in the same pass. Put one
   canonical implementation entry point in \`path:\` — the repo-relative file or
   directory an unfamiliar agent should open first. \`elements:\` contains only
   slugs of real element nodes whose implementation roles differ in a sentence;
   never put a raw file path in that graph relation. A capability with neither
   \`path:\` nor an element relation is a claim nobody can open. This does not block
   the write; the node is reported under \`capability_without_evidence\` in
   \`maintenance_plan\` until it points at something.`;

/**
 * Appended to `add_concept` / `add_concepts` tool descriptions.
 *
 * The tool description is the one text an LLM reads **immediately before calling**,
 * so it carries the rule most likely to be violated in that exact moment: naming an
 * element after a file instead of after a role.
 */
export const ELEMENT_NAMING_RULE_EN = `When \`kind\` is \`element\`: an element names a CONCEPT a capability uses (e.g. "jwt-token"), not a file. If your \`title\` is a bare path or ends in a source extension, you are describing evidence, not the concept — rename \`title\` to the role and put the path in \`path:\`, or if 3+ siblings under the same parent already look like this, call \`get_concept\` on the parent and consider \`patch_concept\` on an existing sibling instead of adding another file-mirror node. The same rule binds the \`slug\`: flat under the kind folder (\`elements/<role-name>\`), never a code path (\`elements/src/views/home\` is rejected) — path-style slugs collide the moment two files share a basename and the graph silently merges distinct nodes.`;

/** Batch variant — same rule, stated for the row-wise call shape. */
export const ELEMENT_NAMING_RULE_BATCH_EN = `Rows whose \`title\` is a bare file path follow the same rule as \`add_concept\` above. Prefer one capability node covering a directory plus a short \`elements:\` list over one row per file, unless each file's role differs in a stated sentence.`;

/**
 * The chat-only delta for the in-app agent panel (internal API key).
 *
 * The MCP server returns structured `warnings` to another program. The chat panel
 * is talking to a person, so the same trigger has to become a sentence on screen
 * BEFORE the tool runs — otherwise the app silently reshapes the user's ontology
 * and logs it where they will never look.
 */
export const CHAT_RULES_DELTA_EN = `You are talking to a person, not returning structured \`warnings\` to another program. So when step 4 of the construction rules above would have you create a grouping node, say so in the conversation first, in the language the person is writing to you in, and let them answer before you propose the call. A structured warning a person never opens is not a disclosure — silently reshaping someone's ontology and logging it where only a machine looks is the failure this rule exists to prevent.`;

/**
 * Does this title look like a file path rather than a concept name?
 *
 * This is the **code defense** half of the naming rule — it fires whether or not
 * the model read anything, which is exactly why it exists. Kept deliberately
 * narrow: a slash, or a known source extension. Broader heuristics ("contains a
 * dot", "is lowercase") would flag legitimate concept names like `next.config`
 * or `jwt-token`, and a warning that cries wolf gets filtered out by the reader.
 *
 * **Internal whitespace disqualifies it** (2026-07-31, found by running the gate
 * over this repo's own vault). The slash clause alone flagged the title *"CLI
 * Developer Entry (52 commands — … growth/maintenance queue …)"*, which is
 * English prose that happens to contain a slash. A path token in a graph slot has
 * no spaces; a concept title almost always does. Without this the very first
 * real-vault run produced a false positive on a node whose actual defect was
 * something else entirely — and a check that is wrong on its debut is a check the
 * reader stops reading.
 */
export function looksLikePath(title) {
  if (typeof title !== "string") return false;
  const t = title.trim();
  if (t.length === 0) return false;
  if (/\s/.test(t)) return false;
  if (t.includes("/") || t.includes("\\")) return true;
  return /\.(m?[jt]sx?|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|css|scss|json|ya?ml|toml|sh)$/i.test(t);
}

/**
 * Vault slugs are slash-separated too (`capabilities/auth`), so {@link looksLikePath}
 * alone cannot separate a file path from a legitimate slug reference — its slash
 * clause is written for *titles*, where a slash is always wrong.
 *
 * The kind folders the schema itself creates are the discriminator: a reference
 * that starts inside one of them is claiming to be a node, anything else that
 * still looks like a path is claiming to be a file.
 */
const VAULT_FOLDER_SEGMENTS = new Set(
  Object.values(VAULT_KIND_SCHEMA)
    .map((schema) => schema.folder)
    .filter(Boolean)
    .map((folder) => folder.replace(/\/$/, '')),
);

/**
 * Is this graph-array entry evidence (a file) rather than a node reference?
 *
 * ⚠️ Read the contract carefully: **this never decides whether something is a
 * defect.** Reference resolution decides that — the caller only asks this
 * question about entries that already failed to resolve to any vault node. All
 * this changes is which of the two repairs the message names first. So the
 * failure mode of a wrong answer here is a slightly misaimed sentence, not a
 * false alarm, which is why a heuristic is acceptable at all.
 *
 * A vault nested under folders of its own (`services/auth/api.md`) can land on
 * the evidence branch when its reference is *also* broken. That is a wording
 * imprecision on an already-broken reference, and both branches tell the reader
 * to fix the same thing.
 */
export function looksLikeEvidencePath(ref) {
  if (!looksLikePath(ref)) return false;
  const trimmed = String(ref).trim();
  if (trimmed.includes('\\')) return true;
  const segments = trimmed.split('/');
  if (segments.length === 1) return true; // bare "absorb.mjs" — the extension clause fired
  return !VAULT_FOLDER_SEGMENTS.has(segments[0]);
}

/** Warning literal for {@link looksLikePath}. Advisory — never blocks the write. */
export function pathShapedTitleMessage(title) {
  return `title "${title}" looks like a file path, not a concept name — elements name a role, not a location. If this file plays a distinct role, rename the title to that role and move the path into path:. If it doesn't, patch_concept the parent capability's body instead of adding another file-mirror node.`;
}

/**
 * Action text for a dense parent whose references are mostly broken.
 *
 * ⚠️ This proposes a QUESTION, then a tool call — never a ready-made scaffold.
 * An earlier draft handed over "create two sub-capabilities and move half the
 * children", which is precisely the shortest path to passing the metric with
 * empty buckets. The "leave it alone" branch is load-bearing: without an
 * explicit exit, the number becomes the goal.
 *
 * ## Two things this message deliberately stopped saying (2026-07-31 amendment)
 *
 * 1. **"p90=" unconditionally.** The trigger is this vault's own p90 only once
 *    the vault has enough parents of the kind to compute one; before that it is
 *    a researched starting range. Printing "p90" over a bootstrap constant would
 *    dress a shipped default as a measurement of the reader's own data.
 * 2. **Shared prefix as the gate.** The earlier draft made "do 3+ children share
 *    a name/path prefix?" the question the reader must answer first. Measured
 *    against this vault, that signal is wrong in *both* directions:
 *    `topology-kind-color-*` ×4 share a prefix and are legitimate siblings,
 *    while the 92 that are actually broken share no prefix at all. It survives
 *    here as one hint among several, never as a precondition.
 *
 * What replaces it is the only test that held up: can you write one non-circular
 * sentence saying why a child is not interchangeable with its siblings.
 *
 * @param {object} args
 * @param {string} args.parentSlug
 * @param {number} args.count resolved children — unresolved strings are not children
 * @param {string} args.childKind
 * @param {number} args.trigger the number crossed, whatever its basis
 * @param {'vault-p90'|'bootstrap'} args.basis where `trigger` came from
 * @param {string} args.evidence why this parent was looked at in the first place
 */
export function denseParentActionMessage({ parentSlug, count, childKind, trigger, basis, evidence }) {
  const source = basis === 'vault-p90'
    ? `this vault's own p90 for ${childKind} parents is ${trigger}`
    : `the starting range for ${childKind} children is ${trigger} (this vault has too few ${childKind} parents yet for its own percentile to mean anything)`;
  return `"${parentSlug}" has ${count} ${childKind} children that resolve to real nodes, and ${source}. That number is a trigger, not a limit — nothing here caps how many children a node may have, and a wide parent whose children each earn their place is correct. What made this worth mentioning is ${evidence}. Call get_concept("${parentSlug}") and answer one question per child: can you write a non-circular sentence saying why it is NOT interchangeable with its siblings? For every child where you can, leave it alone. Where you cannot for three or more, those children want a BRIDGE NODE — one node named after the behavior they share, with them reparented onto it; the construction rules list the four conditions a bridge has to meet, and a bridge you leave empty is reported back to you for retirement. Shared name prefixes are a hint worth glancing at, not the test — in this vault, prefixed siblings have been legitimate and the broken ones shared no prefix at all.`;
}

/**
 * Render a ref list without turning the message into a wall.
 *
 * `cli-developer-entry` carried 92 of these. A message that pastes all 92 is not
 * read by a person and eats an agent's context for no added decision — the count
 * plus a handful of examples is what the reader acts on.
 */
function sampleRefs(refs, limit) {
  const shown = refs.slice(0, limit).map((ref) => `"${ref}"`).join(', ');
  const rest = refs.length - Math.min(refs.length, limit);
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

/**
 * Warning literal for a graph-array entry that resolves to no vault node.
 *
 * Two branches, deliberately, and deliberately **without** a ready-made
 * `proposedAction`. An earlier shape of this signal (`resolve_dangling_reference`
 * in the compiled maintenance plan) offers only "create the node", and an agent
 * that follows it literally answers 92 unresolved strings by manufacturing 92
 * nodes — the metric goes green and the graph is worse. Naming both exits, and
 * leaving the choice with the caller, is the whole point.
 */
export function danglingGraphReferenceMessage({ slug, key, refs, count, sampleLimit }) {
  return `${count} entry/entries in "${slug}".${key} resolve to no vault node: ${sampleRefs(refs, sampleLimit)}. A relation array is a claim that a node exists; an unresolved string is not a child, it is a name with nothing behind it. Either promote it — add_concept({slug, kind, title}) for the concept it names, then keep the reference — or drop it from ${key}: and record what it points at as evidence on this node instead. Do not leave it in a meaning slot.`;
}

/**
 * Warning literal for the 92: a **file path** sitting in a graph-relation array.
 *
 * This is the case the vault-wide validator could never report — it exempts
 * path-shaped `elements:` entries outright (`isPathLikeGraphRef`), and the
 * compiler routes them to `materialize_external_element`, whose only prescription
 * is "create a node per file". So the one shape that was 100% of the measured
 * defect had, between the two of them, no channel that said "this does not
 * belong here". The write path is where it gets one.
 */
export function pathShapedReferenceMessage({ slug, key, refs, count, sampleLimit }) {
  return `${count} entry/entries in "${slug}".${key} are file paths, not concept names: ${sampleRefs(refs, sampleLimit)}. A path is EVIDENCE for a concept, not the concept — it names where something lives, so it cannot be a child in the graph. For each one, either write the sentence that says what distinct role that file plays and promote it with add_concept({kind:"element", title:"<the role>", path:"<the path>"}), or remove it from ${key}: and keep the path as evidence on "${slug}" (frontmatter path: / the node body). One node per file, mirroring a directory listing, is the failure this check exists to stop.`;
}

/**
 * Warning literal for a capability created with no evidence at all.
 *
 * ## Why this fires at creation and only at creation
 *
 * The honest authoring sequence is "name the behavior, then attach the file", so
 * a capability that has no `elements:` *right now* is not yet wrong. Firing on
 * every later write to the same node would turn a legitimate two-step into a
 * standing accusation, and a channel that repeats itself gets filtered out. The
 * creation moment is the one where the author is still deciding, so that is where
 * the sentence goes — and the durable version of the same question lives in
 * `maintenance_plan` as `capability_without_evidence`, which keeps asking as long
 * as the answer is missing.
 *
 * ⚠️ It never rejects. Construction rule 5 is not negotiable here: refusing an
 * evidence-less capability would make the honest sequence impossible and push
 * agents to route around the tool.
 */
export function capabilityWithoutEvidenceMessage({ slug }) {
  return `"${slug}" is a capability with neither a canonical \`path:\` entrypoint nor an \`elements:\` relation to a real implementation concept, so nothing in the vault says where this behavior lives in code. The write succeeded and nothing here blocks it — but an agent handed only this vault can describe this capability and cannot open it. Attach evidence while you still have the file in hand: patch_concept({slug:"${slug}", frontmatter:{path:"<repo-relative file or directory>"}}). Create an element node only when a distinct implementation role earns ontology identity. Until it points at something, this node is listed under \`capability_without_evidence\` in query_ontology({operation:"maintenance_plan"}).`;
}

/**
 * Warning literal for a batch of siblings born under one parent in one run.
 *
 * The signal is **provenance, not population** — the council threw out every
 * count-based cap, including per-kind ones. Five nodes a person added over a week
 * say nothing at all. Five the same machine batch emitted under one parent say a
 * directory listing was transcribed into the graph, and only the write path can
 * tell those two apart. Note the explicit "leave it alone" branch: without it the
 * trigger becomes a target, which is exactly how a cap gets gamed.
 */
export function bulkProvenanceMessage({ parent, count, slugs, sampleLimit }) {
  return `${count} nodes were created under "${parent}" in this session: ${sampleRefs(slugs, sampleLimit)}. That is a provenance signal, not a size limit — there is no maximum number of children here. Call get_concept("${parent}") and answer one question: can you write a non-circular sentence saying why each of these is NOT interchangeable with its siblings? If yes, this is a legitimately wide parent — leave it exactly as it is. If no, name the shared behavior once with add_concept and patch_concept the siblings that share it to point at that node instead.`;
}

/*
 * ────────────────────────────────────────────────────────────────────────────
 * Meaning gaps in the body — the second half of the same door (2026-09-21)
 *
 * Everything above judges frontmatter. The measured problem is that frontmatter
 * is only half of a node: the app's ACP session cannot run the bulk
 * qualification lifecycle, so every real build lands through `add_concept` /
 * `add_concepts` / `patch_concept`, and that door never opened the body at all.
 * What came through it, measured on this repository's own vault and the
 * field-trial baseline:
 *
 *   - nodes whose body is still the starter template, so the graph holds a
 *     label and no definition;
 *   - `Excludes` bullets that are evidence limits ("not mentioned in this
 *     scan"), which a source-hidden reader later repeats as a product fact;
 *   - evidence `path:` naming a folder — 51 of 107 in this vault — so drift on
 *     that node can never be checked.
 *
 * That is the 2026-08-31 decision's recorded **dissent** («A refusal names the
 * path that stays open»): a person routed to incremental writing may build a
 * shallow vault while believing they completed construction. Its falsifier —
 * junk vaults, validation red, wrong kinds — did not fire and the ledger says
 * so; these vaults validated clean. These sentences exist so the door that is
 * actually used says what is thin while the author still has the file in hand.
 *
 * Same contract as everything above: advisory, never blocking (2026-07-31
 * council, construction rule 5). The logic lives in `meaning-findings.mjs`;
 * only the text lives here, so the reader of a warning and the reader of the
 * rules read one file.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Heading names a body section may use for each side of a concept's boundary.
 *
 * Two sides, because a boundary that only says what is in is not a boundary —
 * §2.1 of the public specification asks for includes *and* excludes before a
 * label becomes a concept. The synonyms are the shapes already found in this
 * vault and in the MCP server instructions ("Constraints: …", "… Boundary",
 * "Inclusions / Exclusions"), so a node written before this check existed is
 * read on its own terms instead of being told to rename a section it already
 * filled.
 *
 * ⚠️ Order matters to the reader of this list: "out of scope" contains "scope",
 * so a caller tests the negative side first and only then the positive one.
 */
export const BODY_BOUNDARY_SECTIONS = Object.freeze({
  includes: Object.freeze(['includes', 'inclusions', 'in scope', 'scope', 'boundary', 'constraints']),
  excludes: Object.freeze(['excludes', 'exclusions', 'out of scope', 'not this']),
});

/**
 * Does this exclusion state an **evidence limit** rather than a product boundary?
 *
 * "Remote vaults are not mentioned in this scan" says what the writer did not
 * see. "Atlas does not sync folders between machines" says what the product does
 * not do. A reader handed the vault without the source cannot tell those apart,
 * and measured in the 2026-08-28 field trial, repeats the first as the second:
 * four observed examples were upgraded to the only operations a capability
 * covers, while the source documented more.
 *
 * It lives in the text layer beside {@link looksLikePath} for two reasons. It is
 * the same kind of narrow wording test, and this module imports nothing but the
 * schema — so the qualification lane (`meaning-evaluation.mjs`) and the write
 * gate (`meaning-findings.mjs`) can both apply one implementation without the
 * import cycle that holding it in either of them would create.
 *
 * Unchanged from the copy that lived in `meaning-evaluation.mjs` until
 * 2026-09-21; the qualification lane now imports it from here.
 */
export function isEpistemicExclusionBoundary(value) {
  const normalized = String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  return EPISTEMIC_EXCLUSION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * What an evidence limit actually sounds like, measured rather than guessed.
 *
 * The first three clauses are the original rule. The rest were added
 * 2026-09-21 after a builder writing a real project node produced three
 * exclusions the original rule read as product boundaries:
 *
 *   - "the test suite and the examples folder, which this survey did not inspect"
 *   - "`typings/index.d.ts`, the TypeScript surface, which was not read"
 *   - "`index.js`, the package front door, which was read but is not carried as
 *     a node in this first pass"
 *
 * Every one says what the writer did not get to, and a reader handed the vault
 * without the source reads all three as things the product does not do. The
 * clauses stay tied to a reading verb ("inspect", "read", "trace", "carried as
 * a node") so an ordinary product boundary — "flags, which are options rather
 * than positional arguments" — does not match.
 */
const EPISTEMIC_EXCLUSION_PATTERNS = Object.freeze([
  /\bnot\s+(?:established|asserted|proven|verified|measured|observed|known|confirmed)\b/,
  /\bremain(?:s|ed)?\s+outside\s+(?:this|the)\s+(?:bounded\s+)?(?:scan|evidence)\b/,
  /\bnot\s+(?:named|listed|mentioned|included|covered|present)\s+in\s+(?:this|the)\s+(?:bounded\s+)?(?:semantic\s+)?(?:excerpt|evidence|scan|packet)\b/,
  // "this survey did not inspect" / "the pass did not reach"
  /\b(?:this|the|our)\s+(?:survey|scan|pass|packet|excerpt|read|analysis|review|session)\s+did\s+not\s+(?:inspect|read|trace|scan|cover|open|look\s+at|examine|visit)\b/,
  // "which was not read" / "were not inspected"
  /\b(?:was|were)\s+not\s+(?:read|inspected|traced|scanned|covered|opened|examined|visited|analysed|analyzed|reviewed)\b/,
  // "is not carried as a node" — the graph has not caught up, which is not a
  // statement about the product at all.
  /\bnot\s+(?:yet\s+)?(?:carried|represented|modelled|modeled|captured)\s+(?:as|in)\b/,
  /\b(?:unread|uninspected|untraced|unscanned)\b/,
  /\bnot\s+(?:yet\s+)?(?:inspected|read|traced)\s+in\s+this\s+(?:first\s+)?(?:pass|survey|scan|round)\b/,
  /\b(?:did\s+not|didn't|could\s+not|couldn't)\s+(?:get\s+to|reach|cover|read)\b/,
  /\boutside\s+(?:what|the\s+files)\s+(?:this|the)\s+(?:survey|scan|pass)\s+(?:read|covered|inspected)\b/,
]);

/**
 * Heading names a body section may use to carry the node's definition.
 *
 * Measured 2026-09-21, after the first version of this check assumed a
 * definition is the prose above the first `##`: the shape the qualification
 * lane actually writes puts it under `## Definition` with nothing above it.
 * Reading only the lead would have accused 15 of 16 nodes in a freshly built
 * vault and 72 of 109 in this repository's own — every one of them defined.
 * A check that is wrong on its debut is a check the reader stops reading.
 */
export const BODY_DEFINITION_SECTIONS = Object.freeze([
  'definition',
  'summary',
  'what it is',
  'what this is',
  'overview',
]);

/** Warning literal for a node whose body never says what the node is. */
export function definitionMissingMessage({ slug, kind }) {
  return `"${slug}" is a ${kind} whose body carries no definition — it is still the starter scaffold, it opens straight into headings, or it only restates the title. The write succeeded and nothing here blocks it; what is missing is the one sentence that makes this a concept instead of a label. Write what this ${kind} is and what it is not, in prose before the first \`##\` or under \`## Definition\`: patch_concept({slug:"${slug}", body:"# <title>\\n\\n<one non-circular sentence: what it is, and what it is not>\\n\\n…"}). An agent handed only this vault can read the title and learn nothing it did not already know from the title.`;
}

/** Warning literal for a boundary side the body never states. */
export function boundaryMissingMessage({ slug, kind, side }) {
  const heading = side === 'excludes' ? 'Excludes' : 'Includes';
  const other = side === 'excludes' ? 'what this is often confused with and is not' : 'what this covers';
  return `"${slug}" (${kind}) has no \`## ${heading}\` section with anything in it, so the body never states ${other}. The write succeeded; this is the half of the boundary the next reader cannot reconstruct from code, because there is no code for a thing deliberately left out. Add it with patch_concept({slug:"${slug}", body:"…\\n\\n## ${heading}\\n\\n- <one concrete item>\\n"}) — one real bullet is worth more than the placeholder, and a placeholder bullet still counts as empty here.`;
}

/**
 * Warning literal for an exclusion that states an evidence limit.
 *
 * The judgement is `isEpistemicExclusionBoundary` from `meaning-evaluation.mjs`
 * — the same rule the qualification lane already applies to a proposal, reused
 * rather than re-implemented, so the two lanes cannot drift into disagreeing
 * about one sentence.
 */
export function epistemicExclusionMessage({ slug, refs, count, sampleLimit }) {
  return `${count} exclusion bullet(s) on "${slug}" state an evidence limit rather than a product boundary: ${sampleRefs(refs, sampleLimit)}. "Not mentioned in this scan" says what the writer did not see; an \`Excludes\` bullet says what the product deliberately does not do. A reader handed the vault without the source cannot tell those apart, and repeats the first as the second — measured in the 2026-08-28 field trial. The write succeeded; move each one to an \`## Uncertainty\` (or \`## Open questions\`) section with patch_concept({slug:"${slug}", body:"…"}), and leave in \`Excludes\` only what a source actually supports.`;
}

/** Warning literal for evidence that names a folder instead of a file. */
export function folderOnlyEvidenceMessage({ slug, path, suggestion }) {
  const opener = suggestion
    ? `Name the one file an unfamiliar agent should open first — \`${suggestion}\` is what this folder offers as an entry point`
    : 'Name the one file an unfamiliar agent should open first';
  return `"${slug}" cites \`path: ${path}\`, and that is a directory. The write succeeded, but drift on a folder can never be checked: a folder's timestamp moves on almost any commit underneath it, so this node's evidence is permanently "unknown" rather than current or stale. ${opener}: patch_concept({slug:"${slug}", frontmatter:{path:"${suggestion || `${path.replace(/\/$/, '')}/<file>`}"}}). Keep the folder in the body as context if it matters; the frontmatter slot is for the one entry point.`;
}

/**
 * Warning literal for a node written outside its kind's folder.
 *
 * ## Why this needed its own sentence (measured 2026-09-21)
 *
 * A post-change trial built an entire vault flat at the root —
 * `slug: option-declaration` carrying `kind: capability`, `slug:
 * help-documentation` carrying `kind: domain` — and `validate_vault` answered
 * **0 issues**. Nothing in the product told the builder the convention exists,
 * so it could not have known to follow it. A convention no channel states is
 * not a convention, it is folklore.
 *
 * ⚠️ It never rejects, and it is deliberately **not** the sibling hard error.
 * `flatSlugIssue` throws on a path-style slug *nested under* a kind folder
 * (`elements/src/views/home`) because that shape silently merges distinct nodes
 * the moment two files share a basename — that is validity. A flat slug at the
 * root merges nothing; it is a vault that reads worse. Reporting is the right
 * response to the second, and blocking would break every vault already written
 * this way.
 *
 * @param {object} args
 * @param {string} args.slug the slug as written
 * @param {string} args.kind
 * @param {string} args.canonicalSlug what the same node is called inside its folder
 */
export function slugOutsideKindFolderMessage({ slug, kind, canonicalSlug }) {
  return `"${slug}" is a ${kind} written at the vault root instead of inside its kind folder, so it reads as "${slug}" where every other ${kind} reads as "${canonicalSlug}". The write succeeded and nothing here blocks it — a flat slug is valid, it just groups with nothing. The map, the README generator, and every other reader that shows a vault by kind group on that folder, so a root-level ${kind} sits beside the project node rather than with its own kind. Move it when you are ready: rename_concept({oldSlug:"${slug}", newSlug:"${canonicalSlug}"}) without \`confirm\` returns a dry-run listing every backlink that would be rewritten; repeat the same call with \`confirm: true\` to move the file and rewrite them in one pass. The UID does not change, so nothing loses its identity.`;
}

/**
 * Heading names a body section may use to record what the writer did not check.
 *
 * ## Why a node needs one at all
 *
 * A node that states no unknown is claiming completeness, and nothing in a
 * vault is complete — the builder read some files and not others, and which
 * ones is the fact a later reader most needs and can least recover. Measured
 * 2026-08-28: exclusions that were really evidence limits were repeated as
 * product facts by a source-hidden reader, because the vault gave those limits
 * nowhere else to live. `epistemic-exclusion` tells a writer to move such a
 * line out of `Excludes`; this says where it goes, and asks for it even when
 * `Excludes` happens to be clean.
 *
 * `confidence` is in the list because a vault already in the wild uses it for
 * exactly this, and a check that renames someone's honest section is a check
 * they switch off.
 */
export const BODY_UNCERTAINTY_SECTIONS = Object.freeze([
  'uncertainty',
  'open questions',
  'unknowns',
  'not checked',
  'confidence',
]);

/** Warning literal for a node that records no unknown at all. */
export function uncertaintyMissingMessage({ slug, kind }) {
  return `"${slug}" (${kind}) records no uncertainty, so the body reads as complete — and nothing in a vault is. The write succeeded and nothing here blocks it; what is missing is the fact a later reader most needs and can least recover: which files you did not open, which claim you inferred rather than read, what you could not check. Without it an agent handed only this vault treats every silence as a settled negative. Say it plainly: patch_concept({slug:"${slug}", body:"…\\n\\n## Uncertainty\\n\\n- <what you did not read or could not check>\\n"}). \`## Open questions\`, \`## Unknowns\`, \`## Not checked\` and \`## Confidence\` are read as the same section, and this is also where an \`Excludes\` bullet belongs once you notice it was an evidence limit rather than a product boundary.`;
}
