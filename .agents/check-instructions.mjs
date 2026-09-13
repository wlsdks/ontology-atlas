import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Repository policy only. The public agent-files CLI keeps reporting literal
// copy differences for other repositories and for human inspection.
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
    }
    for (const [, target] of content.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) continue;
      const path = decodeURIComponent(target.split('#')[0]);
      if (path && !existsSync(resolve(root, dirname(file), path))) failures.push(`${file}: missing reference ${target}`);
    }
  }
  return { files: files.length, skills: skills.length, agents: agents.length, failures };
}

export function run(root = process.cwd()) {
  const result = spawnSync(process.execPath, ['cli/src/index.mjs', 'agent-files', '--json', '--english-only'], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || ![0, 1].includes(result.status)) throw result.error ?? new Error(result.stderr || 'agent-files could not run');
  const report = JSON.parse(result.stdout);
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
