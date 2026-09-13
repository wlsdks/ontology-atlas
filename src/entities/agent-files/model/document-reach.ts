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
 * Whether `path` is written inside `text` as a path rather than as the tail of a longer one.
 *
 * The boundary matters more than it looks: without it, a guide citing `cli/README.md` would also
 * mark the root `README.md` as reached, and the whole count would drift upward in the flattering
 * direction.
 */
export function citesPath(text: string, path: string): boolean {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\w./-])${escaped}`).test(text);
}

export interface DocumentReachInput {
  /** Every authored Markdown path found, repo-relative. */
  markdownPaths: readonly string[];
  /** Guide text by path, for the citation search. Only guides are searched. */
  contents: ReadonlyMap<string, string>;
  excluded: readonly string[];
  truncated: boolean;
}

export function buildDocumentReach({
  markdownPaths,
  contents,
  excluded,
  truncated,
}: DocumentReachInput): DocumentReach {
  const guides = markdownPaths.filter(isGuideDocument);
  const rest = markdownPaths.filter((path) => !isGuideDocument(path));
  const guideText = guides.map((path) => contents.get(path) ?? '').join('\n');

  const named: string[] = [];
  const unnamed: string[] = [];
  for (const path of rest) (citesPath(guideText, path) ? named : unnamed).push(path);

  const byFolder = new Map<string, number>();
  for (const path of unnamed) {
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
    byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
  }

  return {
    total: markdownPaths.length,
    guides: guides.length,
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
