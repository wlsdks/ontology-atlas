/**
 * The project brief: the body of a project document, read as **sections** rather than as
 * one run of prose.
 *
 * Owner, 2026-09-19, looking at the overview tab: *"the body written like this is really
 * unpleasant to look at … shouldn't this be the place the agent analyses and lays out?"*
 * The body is authored Markdown, so the shape it can carry is already decided: a `##`
 * heading opens a section, an ordered list is a sequence, a bullet list is a set. A brief
 * is that shape drawn deliberately: each section a block with its number and title, a
 * sequence as a strip of steps, a set as rows. Nothing is invented here; a body with no
 * `##` headings has no sections and is rendered as the prose it is.
 *
 * The agent writes the sections (`buildBriefPrompt` asks for four), and a person reviews the
 * file in the Library. This module only reads what is there.
 */
interface ProjectBriefSection {
  /** The `##` heading text, trimmed. */
  title: string;
  /** Everything under the heading up to the next `##`, as Markdown. */
  markdown: string;
}

export interface ProjectBrief {
  /** Markdown above the first `##` heading; empty when the body opens with a heading. */
  lead: string;
  sections: ProjectBriefSection[];
}

const SECTION_HEADING = /^##\s+(.+?)\s*#*\s*$/;
const FENCE = /^(```|~~~)/;

/**
 * Splits a body on its `##` headings. Fenced code blocks are skipped so a `## ` inside a
 * code sample does not open a section. `#` (the document's own title) and `###` and deeper
 * stay inside whichever section they fall in.
 */
export function splitProjectBrief(body: string | null | undefined): ProjectBrief {
  const lines = (body ?? "").replace(/\r\n?/g, "\n").split("\n");
  const sections: ProjectBriefSection[] = [];
  const leadLines: string[] = [];
  let current: { title: string; lines: string[] } | null = null;
  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line.trim())) inFence = !inFence;
    const heading = inFence ? null : SECTION_HEADING.exec(line);
    if (heading) {
      if (current) sections.push({ title: current.title, markdown: current.lines.join("\n").trim() });
      current = { title: heading[1], lines: [] };
      continue;
    }
    (current ? current.lines : leadLines).push(line);
  }
  if (current) sections.push({ title: current.title, markdown: current.lines.join("\n").trim() });

  return { lead: leadLines.join("\n").trim(), sections };
}

