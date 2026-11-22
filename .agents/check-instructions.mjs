import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  analyzeAgentFiles,
  classifyAgentFilePath,
  extractAtRefs,
} from '../src/entities/agent-files/model/agent-files.ts';

// Repository policy only. The app's Harness tab keeps reporting literal copy
// differences for other repositories and for human inspection.
export function partitionFindings(findings) {
  const expected = [];
  const failures = [];
  for (const finding of findings) {
    const { check, code } = finding;
    const copyDifference =
      ['skill-copy', 'agent-copy'].includes(check)
      && [check + '-diverged', check + '-file-missing'].includes(code);
    (copyDifference ? expected : failures).push(finding);
  }
  return { expected, failures };
}

function markdownFiles(root, path) {
  if (!existsSync(join(root, path))) return [];
  return readdirSync(join(root, path), { withFileTypes: true }).flatMap((entry) => {
    const child = `${path}/${entry.name}`;
    return entry.isDirectory() ? markdownFiles(root, child)
      : entry.isFile() && entry.name.endsWith('.md') ? [child] : [];
  });
}

export function inspectTree(root, tree) {
  const files = ['skills', 'agents'].flatMap((dir) => markdownFiles(root, `${tree}/${dir}`));
  const skills = files.filter((file) => new RegExp(`^${tree.replace('.', '\\.')}/skills/[^/]+/SKILL\\.md$`).test(file));
  const agents = files.filter((file) => new RegExp(`^${tree.replace('.', '\\.')}/agents/[^/]+\\.md$`).test(file));
  const failures = [];
  if (!skills.length || !agents.length) failures.push(`${tree}: empty skill or agent inventory`);
  for (const file of files) {
    const content = readFileSync(join(root, file), 'utf8');
    if (skills.includes(file) || agents.includes(file)) {
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1];
      const field = (name) => frontmatter?.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();
      const expectedName = skills.includes(file) ? file.split('/').at(-2) : file.split('/').at(-1).slice(0, -3);
      if (!frontmatter || !field('name') || !field('description')) failures.push(`${file}: missing discovery metadata`);
      else if (field('name') !== expectedName) failures.push(`${file}: frontmatter identity mismatch`);
      if (tree === '.agents' && agents.includes(file)) {
        if (field('model') || field('tools')) failures.push(`${file}: inherit the host model and capabilities; do not declare host-specific model/tools aliases`);
        if (!['read-only', 'workspace-write'].includes(field('access'))) failures.push(`${file}: missing or invalid access boundary`);
      }
      if (tree === '.claude' && agents.includes(file)) {
        if (!field('tools')) failures.push(`${file}: missing tools allowlist`);
        if (!['opus', 'fable'].includes(field('model'))) failures.push(`${file}: missing or invalid model (opus or fable)`);
        if (!/^[1-9]\d*$/.test(field('maxTurns') ?? '')) failures.push(`${file}: missing or invalid maxTurns`);
      }
    }
    for (const [, target] of content.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) continue;
      const path = decodeURIComponent(target.split('#')[0]);
      if (path && !existsSync(resolve(root, dirname(file), path))) failures.push(`${file}: missing reference ${target}`);
    }
  }
  return { files: files.length, skills: skills.length, agents: agents.length, failures };
}

/** Root files an agent reads, plus the directories walked for rules, hooks, skills and briefs. */
const ROOT_FILE_CANDIDATES = Object.freeze([
  'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules', '.mcp.json',
  '.github/copilot-instructions.md', '.claude/settings.json',
]);
const SCAN_DIRS = Object.freeze([
  '.claude/rules', '.claude/hooks', '.claude/skills', '.claude/agents',
  '.agents/skills', '.agents/agents', '.cursor/rules', '.codex',
]);
const MAX_CONTENT_BYTES = 512 * 1024;

function walkFiles(absDir, relDir, ancestors = new Set()) {
  const realDirectory = realpathSync.native(absDir);
  if (ancestors.has(realDirectory)) return [];
  ancestors.add(realDirectory);
  const out = [];
  for (const name of readdirSync(absDir)) {
    const absChild = join(absDir, name);
    let stat;
    try {
      stat = statSync(absChild);
    } catch (error) {
      if (['ENOENT', 'ELOOP', 'ENOTDIR'].includes(error.code)) continue;
      throw error;
    }
    if (stat.isDirectory()) out.push(...walkFiles(absChild, `${relDir}/${name}`, ancestors));
    else if (stat.isFile()) out.push(`${relDir}/${name}`);
  }
  ancestors.delete(realDirectory);
  return out;
}

function readEntry(root, relativePath, realRoot) {
  const absPath = join(root, relativePath);
  const bytes = statSync(absPath).size;
  const content = bytes <= MAX_CONTENT_BYTES ? readFileSync(absPath, 'utf-8') : null;
  const fromRoot = relative(realRoot, realpathSync.native(absPath));
  const outside = fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
  return outside ? { path: relativePath, content, bytes, outside: true } : { path: relativePath, content, bytes };
}

/** Only the known agent-file patterns, never the whole tree; nested AGENTS.md one level deep. */
export function scanAgentFiles(root) {
  const realRoot = realpathSync.native(root);
  const isFile = (path) => existsSync(join(root, path)) && statSync(join(root, path)).isFile();
  const paths = ROOT_FILE_CANDIDATES.filter(isFile);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const nested = `${entry.name}/AGENTS.md`;
    if (isFile(nested) && classifyAgentFilePath(nested)) paths.push(nested);
  }
  for (const directory of SCAN_DIRS) {
    const abs = join(root, directory);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
    paths.push(...walkFiles(abs, directory).filter((path) => classifyAgentFilePath(path)));
  }
  return paths.map((path) => readEntry(root, path, realRoot));
}

/** Resolves only the @references the files name, so the pure analyzer can judge existence. */
function referencedPaths(root, files) {
  const existing = new Set();
  for (const entry of files) {
    if (!/\.(md|mdc)$/.test(entry.path) || typeof entry.content !== 'string') continue;
    const directory = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    for (const { ref } of extractAtRefs(entry.content)) {
      if (ref.includes('*')) continue;
      for (const candidate of [ref, directory ? `${directory}/${ref}` : ref]) {
        const normalized = candidate.split('/').filter((part) => part !== '.' && part !== '').join('/');
        if (!normalized.includes('..') && existsSync(join(root, normalized))) existing.add(normalized);
      }
    }
  }
  if (existsSync(join(root, 'AGENTS.md'))) existing.add('AGENTS.md');
  return [...existing].sort();
}

export function run(root = process.cwd()) {
  const files = scanAgentFiles(root);
  const report = analyzeAgentFiles({ files, existingPaths: referencedPaths(root, files), requireEnglish: true });
  if (!Array.isArray(report.drift) || !report.summary?.files) throw new Error('agent-files returned an empty or invalid inventory');
  const { expected, failures } = partitionFindings(report.drift);
  const trees = ['.agents', '.claude'].map((tree) => ({ tree, ...inspectTree(root, tree) }));
  const errors = [...failures.map((entry) => entry.message), ...trees.flatMap((tree) => tree.failures)];
  console.log(`[agent-instructions] ${report.summary.files} files; ${expected.length} expected independent-harness differences`);
  for (const tree of trees) console.log(`[agent-instructions] ${tree.tree}: ${tree.skills} skills, ${tree.agents} briefs, ${tree.files} Markdown files`);
  for (const error of errors) console.error(`[agent-instructions] ${error}`);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = run(); }
  catch (error) { console.error(`[agent-instructions] ${error.message}`); process.exitCode = 1; }
}
