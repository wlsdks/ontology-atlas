/**
 * Instructions a user copies into their own agent; a sibling of `vault-path-for-packet.ts`.
 *
 * Builders, not constants: a baked-in `.` path points at whatever folder the agent runs in.
 * English only, not i18n: the reader is an agent, and translated tool names and imperatives
 * make it call a different tool. The screen caption explains to the person.
 *
 * Every tool and command named here must exist, or the paste fails at once; repo-only skills
 * and `npx ontology-atlas` are unusable. `tests/contract/mcp/agent-prompt-tool-names.contract.test.ts`
 * checks the tool names.
 */

const UNKNOWN_VAULT = "the folder you are opened in";

function vaultRef(vaultPath: string | null | undefined): string {
  const trimmed = vaultPath?.trim();
  return trimmed ? trimmed : UNKNOWN_VAULT;
}

/**
 * Does not paraphrase the server's write lifecycle, which it publishes in `instructions` and in the
 * next call each write answers with. A single session lands meaning in reviewed small batches
 * (step 6).
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
    `1. Call connection_info, list_concepts({ limit: 1 }) for its census,`,
    `   and validate_vault first so the active vault, current graph, and`,
    `   write surface are known.`,
    `2. If the vault already has a curated graph, investigate and sync it; do`,
    `   not restart bootstrap merely because source evidence changed.`,
    `3. Use analyze_repo_structure and infer_imports only as`,
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
    `6. Present the proposal and its qualification gaps for human review,`,
    `   then land what they accept the way a single session can actually`,
    `   finish: a few concepts at a time. Show one short batch with its`,
    `   evidence, write what they approve with add_concepts and`,
    `   add_relations, and repeat. Every body carries its definition`,
    `   sentence, its Includes/Excludes boundary, and an Uncertainty line`,
    `   naming what you could not check; an evidence limit belongs in that`,
    `   line and never in an Excludes bullet. Every relation carries a why,`,
    `   every slug sits under its kind folder, and a capability or element`,
    `   carries a path naming a file.`,
    `   After a batch lands, run validate_vault, and once the shape is`,
    `   settled call connect_project_source and finalize_project_meaning.`,
    `   Answer every warning a tool returns by the repair it names, or say`,
    `   why you are not. Each write names what is still unplaced or unread and`,
    `   the next call to make; follow it, and read the construction card in`,
    `   this server's own instructions rather than inferring the rest.`,
    `7. Never use delete_concept, merge_concepts, rename_concept,`,
    `   or absorb_document as part of ordinary synchronization`,
    `   unless the human explicitly requested that operation and reviewed its`,
    `   dry-run or preflight.`,
  ].join("\n");
}

/**
 * Instructions that verify the connection first and name the next step, for someone not
 * comfortable editing config files. The agent never writes the config: the app knows the
 * absolute path and its Connect Agent button writes it, so the fact lives in one place.
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
    `   whether vaultRoot equals ${vault}. Then call list_concepts({ limit: 1 })`,
    `   and validate_vault({}) and report the census total and problem-file`,
    `   count.`,
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
