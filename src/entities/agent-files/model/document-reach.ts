/**
 * **Which documents an agent can actually get to.**
 *
 * The harness's most common silent failure is not a missing rule. It is a document that exists: a
 * team writes the specification, nobody points the agent at it, and the agent never opens it. What
 * the humans then experience is "the agent ignores our documentation", and nothing in the
 * repository looks wrong.
 *
 * So every authored Markdown file falls into exactly one of three states, and the test is **not**
 * "is it Markdown" but **does any guide send an agent to it**:
 *
 * 1. **A guide** — `AGENTS.md`, `CLAUDE.md`, a nested `AGENTS.md`, a `.claude/rules` file, a skill.
 *    Read without being asked.
 * 2. **Named by a guide** — a guide cites its path. Reached when it is needed.
 * 3. **Named by nothing** — present on disk and unreachable from any guide.
 *
 * **This is a fact, not a judgement**, which is exactly why it survives the objection that sank
 * every scoring tool: "is a guide pointing at this file" is answerable from the files, while "is
 * this repository mature" is not. The third state is therefore reported and never scored. Some of
 * those documents *should* be unreferenced — fixtures, samples, an archive — so the folders are
 * printed beside the count and the reader decides which is which. Nothing is filtered out of sight.
 *
 * ⚠️ **Citation, not glob coverage.** A `.claude/rules` file's frontmatter `paths:` says "load this
 * rule when the agent touches a file matching this glob" — it does not say the agent reads those
 * files. Measuring reachability from `paths:` makes `documentation.md`'s `docs/**` mark every
 * document reached and returns zero orphans, which is the opposite of the truth. Only a literal
 * path written inside a guide counts here.
 *
 * ⚠️ **A named design file is still not a seen design.** A guide may cite a Figma URL or an image,
 * and this says the document references it — never that the agent can look at it. Same line the
 * hook rule draws: the script exists, it did not necessarily run.
 */

interface DocumentReachFolder {
  folder: string;
  count: number;
}

export interface DocumentReach {
  /** Authored Markdown files found, after the stated exclusions. */
  total: number;
  guides: number;
  /** Documents a guide names directly. One hop. */
  namedDirect: number;
  /** How many hops the citation walk took before nothing new was reached. */
  hops: number;
  /**
   * Guides that are the Codex-side copy of a `.claude/skills` guide the repository declares
   * byte-identical. Printed beside the guide count so it is not read as that many distinct
   * documents.
   */
  mirroredGuides: number;
  named: number;
  unnamed: number;
  /** Where the unnamed documents are, most first. The reader judges which folders should be there. */
  unnamedByFolder: readonly DocumentReachFolder[];
  /** Folders left out of `total`, named on screen rather than dropped in silence. */
  excluded: readonly string[];
  /** The walk hit its bound, so every count is a floor rather than a total. */
  truncated: boolean;
}

const GUIDE_PATTERNS: readonly RegExp[] = Object.freeze([
  /^CLAUDE\.md$/,
  /^AGENTS\.md$/,
  /^GEMINI\.md$/,
  /^[^/]+\/AGENTS\.md$/,
  /^\.claude\/rules\/.+\.md$/,
  /^\.claude\/skills\/.+\.mdc?$/,
  /^\.agents\/skills\/.+\.mdc?$/,
  /^\.cursor\/rules\/.+\.mdc$/,
  /^\.github\/copilot-instructions\.md$/,
]);

/**
 * A document read without being asked.
 *
 * `.claude/agents` and `.agents/agents` are deliberately **not** guides: an agent brief loads only
 * when a person convenes that seat, so it belongs on the other side of the question along with
 * every other document. That it then usually turns up as "named by nothing" is a true statement
 * about how briefs are addressed — by name, not by path — and the folder printed beside the count
 * is what lets a reader see that rather than mistake it for a defect.
 */
function isGuideDocument(path: string): boolean {
  return GUIDE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Every Markdown path written in `text`, read once.
 *
 * ⚠️ **One pass over the text, not one pass per candidate.** The first build asked `citesPath` for
 * each of ~450 candidate documents against a frontier that is the concatenation of every document
 * reached so far — megabytes of text, 450 compiled regexes, four hops. Recorded in the installed
 * app on 2026-09-13: after the last progress report the panel held **one frozen frame for 2.6
 * seconds** while this ran on the main thread, which is precisely the "has it stalled?" reading the
 * whole waiting screen exists to prevent. Scanning the text for path tokens once and intersecting
 * with the candidates is the same answer in one pass.
 *
 * The boundary is in the token shape and matters more than it looks: a guide citing
 * `cli/README.md` must not also mark the root `README.md` as reached, or the count drifts upward in
 * the flattering direction.
 */
const MARKDOWN_PATH_TOKEN = /(?:^|[^\w./-])([A-Za-z0-9_][A-Za-z0-9_./-]*\.mdc?)(?![\w])/g;

function citedPaths(text: string): Set<string> {
  const out = new Set<string>();
  MARKDOWN_PATH_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_PATH_TOKEN.exec(String(text ?? ''))) !== null) out.add(match[1]);
  return out;
}

/** Whether `path` is written inside `text` as a path rather than as the tail of a longer one. */
export function citesPath(text: string, path: string): boolean {
  return citedPaths(text).has(path);
}

export interface DocumentReachInput {
  /** Every authored Markdown path found, repo-relative. */
  markdownPaths: readonly string[];
  /** Text by path for every document the walk reads: the guides, and each document they reach. */
  contents: ReadonlyMap<string, string>;
  excluded: readonly string[];
  truncated: boolean;
  /**
   * Called before each hop, with a chance to hand the main thread back.
   *
   * The walk is the last thing the read does and it runs between the final progress report and the
   * result, so without this the screen holds one frozen frame for the whole of it — the reading the
   * waiting state exists to prevent. Awaited, so a caller can yield.
   */
  onHop?: (hop: number) => Promise<void> | void;
}

/**
 * **Reachability is transitive, and measuring one hop is the flattering mistake in the other
 * direction.**
 *
 * The failure this census is about is a document an agent will never open. An agent that opens
 * `AGENTS.md`, follows it to `docs/ARCHITECTURE.md`, and follows that to `docs/FOUNDATIONS.md` has
 * opened `FOUNDATIONS.md` — so counting only what a guide names *directly* calls it unread, which
 * is exactly as wrong as counting a glob's whole subtree as read. The first build shipped one hop
 * and called the remainder "named by nothing"; on this repository that moved 34 documents,
 * including `CONTRIBUTING.md`, `SECURITY.md` and this feature's own decision record, into a bucket
 * the screen said an agent would never open (Evidence seat, 2026-09-13).
 *
 * So the walk runs to a fixpoint and the screen prints both numbers: what a guide names directly,
 * and what is reachable by following citations. Neither is a guess about how far an agent will
 * follow a link — both are counts of links that exist.
 */
export async function buildDocumentReach({
  markdownPaths,
  contents,
  excluded,
  truncated,
  onHop,
}: DocumentReachInput): Promise<DocumentReach> {
  const guides = markdownPaths.filter(isGuideDocument);
  const rest = markdownPaths.filter((path) => !isGuideDocument(path));

  const remaining = new Set(rest);
  const reached = new Set<string>();
  let frontier = guides.map((path) => contents.get(path) ?? '').join('\n');
  let namedDirect = 0;
  let hops = 0;
  while (frontier) {
    hops += 1;
    await onHop?.(hops);
    const cited = citedPaths(frontier);
    const found: string[] = [];
    for (const path of cited) {
      if (remaining.delete(path)) found.push(path);
    }
    if (hops === 1) namedDirect = found.length;
    if (found.length === 0) break;
    for (const path of found) reached.add(path);
    frontier = found.map((path) => contents.get(path) ?? '').join('\n');
  }

  const named = rest.filter((path) => reached.has(path));
  const unnamed = rest.filter((path) => !reached.has(path));

  const byFolder = new Map<string, number>();
  for (const path of unnamed) {
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
    byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
  }

  return {
    total: markdownPaths.length,
    guides: guides.length,
    namedDirect,
    hops,
    mirroredGuides: guides.filter((path) => path.startsWith('.agents/skills/')).length,
    named: named.length,
    unnamed: unnamed.length,
    unnamedByFolder: [...byFolder]
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder)),
    excluded,
    truncated,
  };
}
