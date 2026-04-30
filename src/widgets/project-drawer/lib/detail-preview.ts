export interface ProjectDetailPreview {
  blocks: string[];
  hasMore: boolean;
}

/**
 * 드로어에서는 detail 전문 대신 앞부분만 요약해서 보여준다.
 * fenced code block 내부의 빈 줄은 preview block 분리로 취급하지 않는다.
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
