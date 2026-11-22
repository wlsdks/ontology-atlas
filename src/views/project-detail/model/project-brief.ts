/**
 * A project body read as its `##` sections; a body without them stays prose. Only reads: the agent
 * writes the sections (`buildBriefPrompt`) and a person reviews them in the Library.
 */
interface ProjectBriefSection {
  title: string;
  markdown: string;
}

export interface ProjectBrief {
  lead: string;
  sections: ProjectBriefSection[];
}

/* The closing `#` run is trimmed in code: a lazy title before optional runs backtracks cubically. */
const SECTION_HEADING = /^##\s+(\S.*)$/;

function headingTitle(rest: string): string {
  const trimmed = rest.trimEnd();
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === "#") end -= 1;
  return trimmed.slice(0, end).trimEnd() || trimmed;
}
const FENCE = /^(```|~~~)/;

/**
 * Skips fenced code, so a `## ` in a sample opens no section; `#` and `###` stay inside
 * their section. O(L) over lines.
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
      current = { title: headingTitle(heading[1]), lines: [] };
      continue;
    }
    (current ? current.lines : leadLines).push(line);
  }
  if (current) sections.push({ title: current.title, markdown: current.lines.join("\n").trim() });

  return { lead: leadLines.join("\n").trim(), sections };
}

