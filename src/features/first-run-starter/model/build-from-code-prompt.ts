/**
 * The instruction the 「make a map from my code」 door sends as the person's first turn.
 *
 * ⚠️ **Why this is a sentence and not a function call** (decision, 2026-08-24). The app never calls
 * MCP — that is the agents' surface — so a door that analysed the repository itself would create a
 * second canonical implementation of `analyze_repo_structure`, which `AGENTS.md` forbids. Handing
 * the work to the agent is not a workaround; it is the shape this product argues for: the agent
 * works through MCP and the person approves every write.
 *
 * **It names the order, because an unspecified order is invented.** Left to itself an agent tends
 * to create first and explain later, which is the failure the session's own handoff instructions
 * already record. So the sentence asks for the survey first, the proposal second, and the writing
 * only after the person has seen what is proposed.
 *
 * **It promises nothing the checkpoint does not keep.** Every write this leads to still stops at
 * the permission card (decisions (113) and (114)); this sentence does not and cannot bypass one.
 * It is written in the person's own voice because it lands in the transcript as their turn — a
 * button that names an instruction should send that instruction, not something else.
 *
 * The wording stays in English deliberately. The session's appended instructions already tell the
 * agent to answer in the language the person wrote in, and an instruction the adapter parses is not
 * the place to test that.
 */
export function buildFromCodePrompt(
  rootPath: string | null,
  folderName: string | null,
): string {
  // The absolute path when the desktop bridge knows it, the folder's name when it does not, and
  // "this folder" when neither is available — never an invented path.
  const target = rootPath ?? (folderName ? `the folder named "${folderName}"` : 'this folder');
  return [
    `Build a first ontology for ${target}.`,
    '',
    'Work in this order and stop at each boundary:',
    '1. Survey the code with `analyze_repo_structure`, and use `infer_imports` where the',
    '   structure alone does not say what depends on what. Read before you write.',
    '2. Tell me, in plain sentences, what you found: which domains this product seems to have,',
    '   which capabilities sit under them, and which files implement each one. Name anything you',
    '   are unsure about rather than guessing it into a node.',
    '3. Only then create the nodes and relations, with `connect_project_source` binding this code',
    '   folder to the vault so each capability keeps its evidence.',
    '',
    'Prefer few, well-evidenced concepts over many thin ones. If two things look like the same',
    'concept, ask me instead of making both.',
  ].join('\n');
}
