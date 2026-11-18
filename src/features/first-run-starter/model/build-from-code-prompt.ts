/**
 * The first turn the 「make a map from my code」 door sends. A sentence, not a call: the app never
 * calls MCP, and analysing the repository here would be a second `analyze_repo_structure`, which
 * `AGENTS.md` forbids.
 * - Breadth comes before depth, in one run: every ability the survey lists is placed (its own
 *   capability, named in the node that covers it, or excluded with a reason); then each capability
 *   is read by symbol. Asking agents to follow callees did not work (2 of 62 reads did), so the
 *   symbol read returns the callers' guards, constructor defaults and deciding callees itself, and
 *   the prompt asks for the rule with the cite of the lines that hold it. The tools report what is
 *   unplaced, unread or uncited, so no count target.
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
    '   file of every unit it lists, up to sixteen files per call. Every ability it lists ends up as its',
    '   own capability, named inside the node that covers it, or excluded with a reason in the',
    '   project\'s Uncertainty: one capability per thing the user gets, and a family of siblings',
    '   (plugins, adapters, transforms) as one capability with its members named.',
    '2. Depth. Read every capability by symbol (`analyze_repo_structure` sourceReads with `symbol`,',
    '   three or four per call). Each read returns the body with the code that decides it: the guard',
    '   around each call in its callers, the constructor\'s defaults and the callees that decide it, each',
    '   with a `cite`. When a read says the deciding condition is in a caller, read that caller too.',
    '   Breadth comes first: if you run short, cut depth on the abilities beyond the must-have set,',
    '   never breadth.',
    '3. Tell me the outline in a few short plain sentences: the purpose, the domains, one line per',
    '   ability with its entry file, the implementation roles the rest leans on, and what depends on',
    '   what. Say what you only outlined and what you did not open. Ask only a question whose answer',
    '   changes which nodes exist, say what you will do by default, and carry on with that default',
    '   without waiting for me.',
    '4. Write all of it: project and domains, then abilities, then roles, then relations. Each write',
    '   lists what no node places yet, which entry files were never read and which rules cite no read',
    '   lines, with the exact next call;',
    '   make those calls. Then run `validate_vault`, `connect_project_source` and',
    '   `finalize_project_meaning`, and tell me what the folder holds and what is still unopened. The',
    '   app may ask me to allow a write; that is not a reason to stop and ask me here.',
    '',
    'Name each node the way a teammate would say it aloud, in words from the docs, README, interface',
    'text or command help: no file path, camelCase, snake_case, file extension or class suffix in a',
    'title. A product or class name the docs use is a real name. Keep each node under 150 words: a',
    'first sentence of 25 words or fewer that defines it without an identifier, then the deciding rule',
    'in one to three sentences (the condition, order or default a newcomer would ask about, with no',
    'branch ladders or status codes) followed by the cite of the read lines that hold its condition,',
    'such as `src/billing/invoice.ts:L40-L52`, then what it includes and excludes, and what you did not',
    'check. Code you did not read is an unknown, not an exclusion, and a choice you made for me is',
    'recorded as yours.',
    '',
    'A depends on B when changing B can break A in the product as it ships: consumer to provider. A',
    'caller depends on the interface it calls, or on its default implementation when the interface has',
    'no node of its own; an implementation does not depend on its interface, and an interface never',
    'depends on an implementation; the part that wires things together depends on what it wires. For',
    'every ability, ask which other ability must have run, be configured or be present first, and link',
    'them with a why that cites the read lines. Never write both directions between one pair.',
  ].join('\n');
}
