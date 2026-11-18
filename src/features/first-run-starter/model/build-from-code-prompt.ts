/**
 * The first turn the 「make a map from my code」 door sends. A sentence, not a call: the app never
 * calls MCP, and analysing the repository here would be a second `analyze_repo_structure`, which
 * `AGENTS.md` forbids.
 * - Breadth comes before depth, and depth is required: every unit outlined, every ability listed,
 *   then each must-have ability's entry function read with line ranges before its node is written.
 *   Builds that stopped at outlines wrote nodes that said "outlined only" and relation notes about
 *   code nobody read. Coverage comes from the tools, so the prompt sets no count target.
 * - The agent says the outline and writes it in the same run; a question it asks carries the
 *   default it takes (decision 0f78a22b). Each write still meets the app's permission card
 *   unless the person turned on auto-approve; binding the folder and finalizing always do.
 * - Titles are the words a teammate says aloud, never an identifier.
 * English, in the person's voice, because it lands in the transcript as their turn.
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
    `Build a first map of ${codeRoot}.`,
    '',
    'I want the whole product on the map first, then how each part works. Work in this order, in one go:',
    '1. Breadth. Call `analyze_repo_structure` once and skip the vault folder. Then outline the main',
    '   file of every unit it lists, up to sixteen files per call. From the outlines and the docs, list',
    '   every ability this product gives a user, an operator or another system, each with the file and',
    '   symbol where it starts: one ability per thing the user gets, and a family of siblings (plugins,',
    '   adapters, transforms) as one ability with its members named.',
    '2. Depth. For every ability the product cannot do without, read its entry function with line',
    '   ranges (`analyze_repo_structure` sourceReads with startLine and maxLines, batched) before you',
    '   write its node. Only abilities beyond that set may stay outlined.',
    '3. Tell me the outline in a few short plain sentences: the purpose, the domains, one line per',
    '   ability with its entry file, the implementation roles the rest leans on, and what depends on',
    '   what. Say what you only outlined and what you did not open. Ask only a question whose answer',
    '   changes which nodes exist, say what you will do by default, and carry on with that default',
    '   without waiting for me.',
    '4. Write all of it: project and domains, then abilities, then roles, then relations. Each write',
    '   reports how much of the product the node paths cover; add nodes for the untouched units or',
    '   say why they stay out. Then run `validate_vault`, `connect_project_source` and',
    '   `finalize_project_meaning`, and tell me what the folder holds and what is still unopened. The',
    '   app may ask me to allow a write; that is not a reason to stop and ask me here.',
    '',
    'Name each node the way a teammate would say it aloud, in words from the docs, README, interface',
    'text or command help: no file path, camelCase, snake_case, file extension or class suffix in a',
    'title. A product or class name the docs use is a real name. Keep each node under 150 words: a',
    'first sentence of 25 words or fewer that defines it without an identifier, then how it works in',
    'one to three sentences (the rule, condition, order or default a newcomer would ask about, with no',
    'branch ladders or status codes), what it includes and excludes, and what you did not check. Cite',
    'a file and symbol. Code you did not read is an unknown, not an exclusion, and a choice you made',
    'for me is recorded as yours.',
    '',
    'A depends on B when changing B can break A in the product as it ships: consumer to provider. A',
    'caller depends on the interface it calls; an implementation does not depend on its interface, and',
    'an interface never depends on an implementation; the part that wires things together depends on',
    'what it wires. Link ability to ability when one needs another to have run, be configured or be',
    'present. Never write both directions between one pair.',
  ].join('\n');
}
