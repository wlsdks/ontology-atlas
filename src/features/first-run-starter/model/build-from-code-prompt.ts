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
    '   An outline selects lines to read; it proves no behavior. For each core capability, read its',
    '   entry-point body with `analyze_repo_structure` using `sourceOnly: true` and exact `sourceReads`.',
    '   Trace its setup (constructor or factory) and relevant callees to establish input/default precedence, failure or refusal',
    '   conditions, and caller customization. Read tests when they verify a rule; a test name is not proof.',
    '2. Tell me, in plain sentences, what you found: which domains this product seems to have and',
    '   which capabilities sit under them. For each one give me a single sentence defining it, what',
    '   it includes and what it excludes, and the file that proves it. Name anything you are unsure',
    '   about rather than guessing it into a node.',
    '   Explain the actor/input, condition and outcome you actually read, including the failure path',
    '   and extension points when present. Keep those rules in the node body with exact source line',
    '   citations and read limits; do not replace them with a list of class or function names.',
    '3. After I say yes, write it in small reviewed batches — each node carrying its definition, its',
    '   boundary and what you could not check in the body, each relation carrying a `why`. Then',
    '   check the result with `validate_vault`, bind this code folder with `connect_project_source`',
    '   so each capability keeps its evidence, and finish with `finalize_project_meaning`. Tell me',
    '   what the folder holds now.',
    '   Use `depends_on` only for a necessary prerequisite in the evidenced direction, with its',
    '   condition stated in `why`. A wrapper calling a function does not make the function depend',
    '   on that wrapper. Optional converters or alternative loaders are not unconditional dependencies;',
    '   use a supported `relates` edge or state uncertainty when necessity has not been established.',
    '   Check a counterexample before each dependency: can the capability succeed while the target is',
    '   skipped or replaced? Preserve short-circuit and branch conditions in every rule and rationale.',
    '   Do not say every call, always or never when an inspected branch supplies a counterexample.',
    '   Copy the exact returned source citation (range and hash); read a narrower range before giving',
    '   narrower line numbers. Trace optional flags and callback error propagation, not just defaults.',
    '   Project exclusions need a documented boundary or owner decision; missing code in a bounded',
    '   read is uncertainty. No explicit raise in one branch does not mean no exception can escape it.',
    '',
    'Prefer few, well-evidenced concepts over many thin ones. If two things look like the same',
    'concept, ask me instead of making both.',
  ].join('\n');
}
