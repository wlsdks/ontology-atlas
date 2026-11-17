export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Folders whose files a group row already names; inside the group a file reads from below them. */
const NAMED_FOLDERS = [
  '.claude/rules/',
  '.claude/skills/',
  '.claude/agents/',
  '.claude/hooks/',
  '.agents/skills/',
  '.agents/agents/',
  '.codex/hooks/',
  '.cursor/rules/',
];

export function shortLabel(label: string): string {
  const folder = NAMED_FOLDERS.find((prefix) => label.startsWith(prefix));
  return folder ? label.slice(folder.length) : label;
}
