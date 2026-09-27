/**
 * The first turn the 「make a map from my code」 door sends. A sentence, not a call: the app never
 * calls MCP, and analysing the repository here would be a second `analyze_repo_structure`, which
 * `AGENTS.md` forbids.
 * - It names the order (survey, propose, write after approval), or agents create first.
 * - The write step names small reviewed batches, then validate, bind and finalize: an app session
 *   has no independent evaluator, so the bulk lifecycle stops at `canWrite:false`.
 * - It asks for what could not be checked, so the first body states its unknowns.
 * Every write still stops at the permission card (decisions (113) and (114)). English, in the
 * person's voice, because it lands in the transcript as their turn.
 */
export function buildFromCodePrompt(
  rootPath: string | null,
  folderName: string | null,
): string {
  // The absolute path, else the folder's name, else "this folder"; never an invented path.
  const target = rootPath ?? (folderName ? `the folder named "${folderName}"` : 'this folder');
  // The vault lives inside the project (`<project>/atlas`), so the survey target is its parent,
  // or an agent surveys only the files Atlas just seeded.
  const codeRoot = rootPath ? `${rootPath} (the vault sits inside it, at ${rootPath}/atlas)` : target;
  return [
    `Build a first ontology for ${codeRoot}.`,
    '',
    'Work in this order and stop at each boundary:',
    '1. Survey the code with `analyze_repo_structure`, and use `infer_imports` where the',
    '   structure alone does not say what depends on what. Read before you write.',
    '   Skip the vault folder itself; it holds the map, not the product.',
    '2. Tell me, in plain sentences, what you found: which domains this product seems to have and',
    '   which capabilities sit under them. For each one give me a single sentence defining it, what',
    '   it includes and what it excludes, and the file that proves it. Name anything you are unsure',
    '   about rather than guessing it into a node.',
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
