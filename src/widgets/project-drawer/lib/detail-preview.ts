export interface ProjectDetailPreview {
  blocks: string[];
  hasMore: boolean;
}

/**
 * The drawer summarises only the beginning of the detail rather than the full text.
 * An empty line inside a fenced code block is not treated as a preview-block break.
 */
export function getProjectDetailPreview(
  detail: string | undefined,
  maxBlocks = 3,
): ProjectDetailPreview {
  if (!detail) {
    return { blocks: [], hasMore: false };
  }

  const normalized = detail.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { blocks: [], hasMore: false };
  }

  const blocks: string[] = [];
  const currentLines: string[] = [];
  let inCodeFence = false;

  const pushBlock = () => {
    const block = currentLines.join("\n").trim();
    if (block) {
      blocks.push(block);
    }
    currentLines.length = 0;
  };

  for (const line of normalized.split("\n")) {
    if (line.trim().startsWith("```")) {
      inCodeFence = !inCodeFence;
      currentLines.push(line);
      continue;
    }

    if (!inCodeFence && line.trim() === "") {
      pushBlock();
      continue;
    }

    currentLines.push(line);
  }

  pushBlock();

  return {
    blocks: blocks.slice(0, maxBlocks),
    hasMore: blocks.length > maxBlocks,
  };
}
