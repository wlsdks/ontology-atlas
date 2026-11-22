// The tool count and read/write split that `mcp/package.json`'s description states, for scripts that
// check other surfaces quote the same numbers.

export function parseMcpToolMetadataFromDescription(description) {
  const match = String(description || '').match(/(\d+) tools \((\d+) read \+ (\d+) write\)/);
  if (!match) return null;
  return {
    toolCount: match[1],
    readCount: match[2],
    writeCount: match[3],
    splitText: `${match[2]} read + ${match[3]} write`,
    splitPattern: new RegExp(`\\(${match[2]} read \\+ ${match[3]} write\\)`),
  };
}
