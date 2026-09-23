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
 * **The writing step names the batch path, because 「only then create the nodes」 did not say how.**
 * Reproduced against an unfamiliar repository: the agent read this step beside a handoff that
 * routed every build through the bulk qualification lifecycle, spent a turn authoring a full
 * proposal, and stopped at `canWrite:false` — an app session has no independent evaluator — with
 * the vault still empty after the person had already said to build it. So step 3 now names the
 * path that finishes here: small reviewed batches, then validate, bind, and finalize.
 *
 * **And it asks for what could not be checked, because nothing else will.** The write door
 * answers a body with no stated unknown by a `uncertainty-missing` finding, which is advice
 * arriving after the node exists; a node that states no unknown reads as a complete claim about
 * the product. Asking for it in the person's own turn puts it in the body the first time.
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
  // The vault now lives *inside* the project (`<project>/atlas`), so the code to survey is the
  // parent of the open vault, not the vault. Saying so is not pedantry: an agent told only "build an
  // ontology for this vault" surveys the folder it was handed, finds the four files Atlas just
  // seeded, and reports a product made of nothing.
  const codeRoot = rootPath ? `${rootPath} (the vault sits inside it, at ${rootPath}/atlas)` : target;
  return [
    `Build a first ontology for ${codeRoot}.`,
    '',
    'Work in this order and stop at each boundary:',
    '1. Survey the code with `analyze_repo_structure`, and use `infer_imports` where the',
    '   structure alone does not say what depends on what. Read before you write.',
    '   Skip the vault folder itself; it holds the map, not the product.',
    '   For each candidate capability, trace one input to its result and a failure or missing-input',
    '   path when present. Check which entry point consumes any option you mention.',
    '2. Tell me, in plain sentences, what you found: which domains this product seems to have and',
    '   which capabilities sit under them. For each one give me a single sentence defining it, what',
    '   it includes and what it excludes, and the file that proves it. Name anything you are unsure',
    '   about rather than guessing it into a node. For each capability, include the traced result',
    '   and failure or missing-input result (or say you did not check one). Attribute option behavior',
    '   to the entry point that consumes it.',
    '3. After I say yes, write it in small reviewed batches — each node carrying its definition, its',
    '   boundary and what you could not check in the body, each relation carrying a `why`. Then',
    '   check the result with `validate_vault`, bind this code folder with `connect_project_source`',
    '   so each capability keeps its evidence, and finish with `finalize_project_meaning`. Tell me',
    '   what the folder holds now.',
    '',
    'Prefer few, well-evidenced concepts over many thin ones. If two things look like the same',
    'concept, ask me instead of making both.',
  ].join('\n');
}
