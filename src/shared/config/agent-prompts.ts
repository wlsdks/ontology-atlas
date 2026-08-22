/**
 * Single source for the **instructions a user copies into their own agent**.
 *
 * Sibling of `cli-invocation.ts`: both are strings the UI composes for an agent to
 * consume verbatim, and several surfaces read them (the checklist, the
 * connection-complete card), which makes `shared/config` the only correct layer.
 *
 * **Builders, not constants.** A static prompt with `.` baked in as the path
 * already caused one incident: open the agent from a different working folder and
 * that `.` points at someone else's folder. A copy detached from the fact (the
 * vault path) is not a copy, it is a wrong answer.
 *
 * **English only — deliberately not in i18n.** The reader of these strings is an
 * **agent**. If tool names (`connection_info`, `add_relations`, …) and imperatives
 * vary by language, the agent mistranslates the sentence and calls a different
 * tool. All three precedents in this repo are English constants, and the one
 * prompt that did go through i18n is exactly where that corruption showed up.
 * Human-readable explanation is the screen caption's job — that caption is the
 * only place a person is told "nothing is written before approval".
 *
 * ⚠️ **Every tool and command named here must actually exist.** An instruction
 * that fails the moment it is pasted is a trap, not help. In particular, skills
 * that exist only in this repo (`/ontology-bootstrap`) and `npx ontology-atlas`
 * (not on any registry) cannot be used.
 * `tests/contract/agent-prompt-tool-names.contract.test.ts` checks these against
 * the MCP tool list.
 */

/** What the prompt calls the folder when the vault path is unknown (on the web, say). */
const UNKNOWN_VAULT = "the folder you are opened in";

function vaultRef(vaultPath: string | null | undefined): string {
  const trimmed = vaultPath?.trim();
  return trimmed ? trimmed : UNKNOWN_VAULT;
}

/**
 * **First step after connecting** — survey the repository and *propose* concept
 * candidates.
 *
 * The last clauses are this product's signature: propose, and write only what a
 * human approved. Where comparable setup prompts end in "EXECUTE NOW", this one
 * writes the contract that the human is the arbiter of meaning into the prompt
 * itself.
 */
export function buildAgentAnalyzePrompt({
  vaultPath,
}: {
  vaultPath: string | null | undefined;
}): string {
  const vault = vaultRef(vaultPath);
  return [
    `You are an agent connected to ${vault} via the ontology-atlas MCP server.`,
    `Goal: inspect this codebase and produce a reviewable ontology proposal;`,
    `do not write to the vault yet.`,
    ``,
    `1. Call connection_info, list_kinds, and validate_vault first so the`,
    `   active vault, current graph, and write surface are known.`,
    `2. If the vault already has a curated graph, investigate and sync it; do`,
    `   not restart bootstrap merely because source evidence changed.`,
    `3. Use analyze_repo_structure, index_project, and infer_imports only as`,
    `   side-effect-free evidence. Folder/package boundaries and import edges`,
    `   are observations, not automatic domains, capabilities, or depends_on`,
    `   relations.`,
    `4. Keep three layers separate in the proposal: observed evidence,`,
    `   proposed meaning, and human-approved ontology facts. For every`,
    `   candidate, include kind, behavior, source witness, and why the nearest`,
    `   adjacent kind is not a better fit.`,
    `5. Qualify project meaning separately: report project source currentness,`,
    `   competency questions, witnesses, gaps, and any review-required state.`,
    `   Structural readiness is not semantic qualification.`,
    `6. Present the proposal, qualification gaps, and exact write plan for`,
    `   human review. Do not call add_concept / add_concepts / add_relation /`,
    `   add_relations until the human explicitly approves that plan. Write only`,
    `   approved items, with the expected mtime guard where available.`,
    `7. Never use delete_concept, merge_concepts, rename_concept,`,
    `   absorb_document, or git_snapshot as part of ordinary synchronization`,
    `   unless the human explicitly requested that operation and reviewed its`,
    `   dry-run or preflight.`,
  ].join("\n");
}

/**
 * **Instructions that verify the connection first** — pasted by someone who is not
 * comfortable editing config files, so the agent checks the current state itself
 * and names the next step.
 *
 * The agent is **never told to write the config file**: the app is what knows the
 * absolute path, and the app's Connect Agent button is what writes the config.
 * Telling the agent to write it too would put the same fact in two places.
 */
export function buildAgentSetupPrompt({
  vaultPath,
}: {
  vaultPath: string | null | undefined;
}): string {
  const vault = vaultRef(vaultPath);
  return [
    `This folder's vault path is ${vault}.`,
    `Goal: confirm whether the ontology-atlas MCP server is connected to this`,
    `session right now, and show the human the next step that matches the`,
    `actual state.`,
    ``,
    `1. If connection_info is in your available tools, call it first and check`,
    `   whether vaultRoot equals ${vault}. Then call list_kinds and`,
    `   validate_vault({}) and report node count and problem-file count.`,
    `2. If connection_info is not available, the connector is not attached yet.`,
    `   Check which of these already exist under ${vault}: .mcp.json,`,
    `   .codex/config.toml, .cursor/mcp.json, .agents/mcp_config.json.`,
    `   - If one exists: tell the human "config exists but this session hasn't`,
    `     picked it up — restart the agent."`,
    `   - If none exist: tell the human "use the ontology-atlas app's Connect`,
    `     Agent button to write config for this vault." Do not write the`,
    `     config file yourself.`,
    `3. Report only what you verified — do not propose next steps as if`,
    `   connected when you have not confirmed connection.`,
  ].join("\n");
}
