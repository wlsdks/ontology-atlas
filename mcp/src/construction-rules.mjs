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
 * only the gate does. That gate is
 * `tests/contract/construction-rules.contract.test.ts`, and until it exists this
 * file is a proposal, not a source of truth.
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
export const CONSTRUCTION_RULES_EN = `## Construction rules — read before add_concept / add_concepts / patch_concept

1. BEFORE adding a child to a parent, call get_concept(parentSlug) and read \`neighbors\`.
2. Compare the parent's direct-child count to this vault's median for that kind
   (list_kinds / query_ontology({operation:'facets'})). IF the count is well above
   that median, this is a TRIGGER for step 3 — NOT a limit. It never blocks a write.
3. When triggered, answer before writing:
   a. Do 3+ existing children share a name/path prefix or the same one-word role?
   b. Can you write ONE non-circular sentence why the new child is NOT interchangeable
      with an existing sibling? If you cannot, patch_concept the existing sibling's
      body instead of creating a new node.
   c. Is the candidate title a file/import path rather than a concept name? A path is
      EVIDENCE of a concept, not the concept — do not create one node per file unless
      each file's role differs in a sentence you can actually write.
4. IF (a) is true for 3+ candidates AND you can name the shared behavior in one
   sentence: call add_concept ONCE for that behavior, then patch_concept each matching
   child to reparent it. IF you cannot name the shared behavior: create NOTHING —
   count alone is not evidence of a problem.
5. This procedure does not block writes. Skipping it still succeeds; \`warnings\` /
   \`postWriteMaintenance\` on the response flags it for cleanup instead.`;

/**
 * Appended to `add_concept` / `add_concepts` tool descriptions.
 *
 * The tool description is the one text an LLM reads **immediately before calling**,
 * so it carries the rule most likely to be violated in that exact moment: naming an
 * element after a file instead of after a role.
 */
export const ELEMENT_NAMING_RULE_EN = `When \`kind\` is \`element\`: an element names a CONCEPT a capability uses (e.g. "jwt-token"), not a file. If your \`title\` is a bare path or ends in a source extension, you are describing evidence, not the concept — rename \`title\` to the role and put the path in \`path:\`, or if 3+ siblings under the same parent already look like this, call \`get_concept\` on the parent and consider \`patch_concept\` on an existing sibling instead of adding another file-mirror node.`;

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
export const CHAT_RULES_DELTA_EN = `Construction rules: same procedure as the MCP server's Construction rules (single source — do not hand-copy). Difference: you are talking to a person, not returning structured \`warnings\` for another program. When step 4 above would trigger, say so in the chat in the user's screen language *before* calling the tool — do not silently create a grouping node and log it only where the user won't read it.`;

/**
 * Does this title look like a file path rather than a concept name?
 *
 * This is the **code defense** half of the naming rule — it fires whether or not
 * the model read anything, which is exactly why it exists. Kept deliberately
 * narrow: a slash, or a known source extension. Broader heuristics ("contains a
 * dot", "is lowercase") would flag legitimate concept names like `next.config`
 * or `jwt-token`, and a warning that cries wolf gets filtered out by the reader.
 */
export function looksLikePath(title) {
  if (typeof title !== "string") return false;
  const t = title.trim();
  if (t.length === 0) return false;
  if (t.includes("/") || t.includes("\\")) return true;
  return /\.(m?[jt]sx?|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|css|scss|json|ya?ml|toml|sh)$/i.test(t);
}

/** Warning literal for {@link looksLikePath}. Advisory — never blocks the write. */
export function pathShapedTitleMessage(title) {
  return `title "${title}" looks like a file path, not a concept name — elements name a role, not a location. If this file plays a distinct role, rename the title to that role and move the path into path:. If it doesn't, patch_concept the parent capability's body instead of adding another file-mirror node.`;
}

/**
 * Warning literal for the growth path — the hole that let 92 accumulate.
 *
 * `patch_concept` is where fan-out actually grows, and it emitted nothing. This
 * message deliberately points back at the SAME check `add_concept` runs, so the
 * two doors teach one rule rather than two.
 */
export function fanoutGrowthMessage({ slug, addedCount, newCount }) {
  return `patch_concept added ${addedCount} entries to "${slug}".elements, now ${newCount} — this is the same fan-out signal add_concept checks at creation time. Run get_concept("${slug}") and apply the same check (shared prefix? distinct role? path-shaped title?) before adding more.`;
}

/**
 * Maintenance-plan action text for a dense parent.
 *
 * ⚠️ This proposes a QUESTION, then a tool call — never a ready-made scaffold.
 * An earlier draft handed over "create two sub-capabilities and move half the
 * children", which is precisely the shortest path to passing the metric with
 * empty buckets. The last sentence is load-bearing: without an explicit
 * "leave it alone" branch, the number becomes the goal.
 */
export function denseParentActionMessage({ parentSlug, count, childKind, p90, domain }) {
  return `"${parentSlug}" has ${count} direct ${childKind} children, above this vault's typical fan-out (p90=${p90}) for ${childKind} — call get_concept("${parentSlug}") and check whether 3+ children share a name/path prefix. If so, call add_concept({kind:"capability", domain:"${domain}", title:"<name the shared behavior>"}) once, then patch_concept each matching child to point at it. If no shared behavior exists, leave this node as-is — do not fold on count alone.`;
}
