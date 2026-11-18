/**
 * The first turn the 「make a map from my code」 door sends. A sentence, not a call: the app never
 * calls MCP, and analysing the repository here would be a second `analyze_repo_structure`, which
 * `AGENTS.md` forbids.
 * - Breadth comes before depth: every unit outlined, every ability listed, then one main flow read
 *   end to end. Three earlier builds read a few bodies deeply and mapped a fifth of the product.
 * - The agent says the outline and writes it in the same run; a question it asks carries the
 *   default it takes (decision 0f78a22b). Each write still meets the app's permission card
 *   unless the person turned on auto-approve.
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
    'I want the whole product on the map first, then detail. Work in this order, in one go:',
    '1. Breadth. Call `analyze_repo_structure` once and skip the vault folder. Then outline the main',
    '   file of every source unit it lists, eight files per call, before reading any function body.',
    '   From the outlines and the docs, list every ability this product gives a user, an operator or',
    '   another system, each with the file and symbol where it starts. A repository of a few hundred',
    '   files usually has 15 to 30; fewer than ten means you stopped early.',
    '2. Main flow. Pick the one flow the product exists for and read it end to end, from its input to',
    '   its output. Read further only where a name does not tell you what a part does or who decides.',
    '3. Tell me the outline in a few short plain sentences: the purpose, the domains, one line per',
    '   ability with its entry file, the 5 to 15 implementation roles the rest leans on, and what',
    '   depends on what. Say what you only outlined and what you did not open. Ask only a question',
    '   whose answer changes which nodes exist, say what you will do by default, and carry on with',
    '   that default without waiting for me.',
    '4. Write all of it: project and domains, then abilities, then roles, then relations. Then run',
    '   `validate_vault`, `connect_project_source` and `finalize_project_meaning`, and tell me what the',
    '   folder holds and what is still unopened. The app may ask me to allow each write unless I',
    '   turned on auto-approve; that is not a reason to stop and ask me here.',
    '',
    'Name each node the way a teammate would say it aloud, in words from the docs, README, interface',
    'text or command help: no file path, camelCase, snake_case, file extension or class suffix in a',
    'title. Keep each node short: a first sentence of 25 words or fewer that defines it without an',
    'identifier, what it does and the one or two rules a newcomer would ask about, what it includes',
    'and excludes, and what you did not check. Cite a file and symbol, not line numbers. Code you did',
    'not read is an unknown, not an exclusion, and a choice you made for me is recorded as yours. A',
    'depends on B when changing B can break A in the product as it ships, even when B sits behind an',
    'interface.',
  ].join('\n');
}
