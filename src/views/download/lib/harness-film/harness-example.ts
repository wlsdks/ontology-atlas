import { scanHarness, type HarnessReport, type HarnessScanPort, type HarnessScanProgress } from '@/entities/agent-files';

/**
 * The harness film's example repository, `my-app/`, as the files on its disk. The film runs the
 * app's own scanner over them, so every count, problem and diff it plays is the Harness tab's own
 * answer for this repository, not a drawing of it. The two `reviewer.md` copies differ only in
 * `tools:`, so the diff the film lifts fits one card.
 */

export const EXAMPLE_SOURCE_ROOT = '~/code/my-app';

const SKILL_NAMES = ['code-review', 'db-migrate', 'release-notes', 'write-tests'] as const;
const RULE_NAMES = ['api', 'db', 'frontend', 'security', 'style', 'testing'] as const;
const WORKFLOW_NAMES = ['ci', 'e2e', 'lint', 'release'] as const;

const skill = (name: string) =>
  `---\nname: ${name}\ndescription: Run the ${name} procedure for this repository.\n---\n\n# ${name}\n\n1. Read the diff.\n2. Follow the checklist.\n3. Report what was not checked.\n`;

const rule = (name: string) => `---\npaths: src/${name}/**\n---\n\n# ${name}\n\nKeep ${name} changes small and covered by a test.\n`;

const workflow = (name: string) =>
  `name: ${name}\non: [push]\njobs:\n  ${name}:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm ${name}\n`;

const reviewer = (tools: string) =>
  `---\nname: reviewer\ndescription: Reviews a diff.\ntools: ${tools}\n---\nReview the diff. Never edit files.\n`;

const planner = '---\nname: planner\ndescription: Splits a request into slices.\ntools: Read, Grep, Glob\n---\n\nPlan the work. Do not edit files.\n';

export const EXAMPLE_FILES: Readonly<Record<string, string>> = Object.freeze({
  'AGENTS.md':
    '# my-app\n\nA storefront API and its web client.\n\n## Commands\n\n- `pnpm test` runs unit tests.\n- `pnpm lint` and `pnpm typecheck` must pass before a commit.\n\n## Rules\n\n- Never force-push `main`.\n- Database changes go through a migration.\n',
  'CLAUDE.md': '@AGENTS.md\n\n## Claude Code\n\nRules load from `.claude/rules/`. Hooks block force pushes and publishing.\n',
  'package.json':
    '{\n  "name": "my-app",\n  "private": true,\n  "scripts": {\n    "lint": "eslint .",\n    "typecheck": "tsc --noEmit",\n    "test": "vitest run"\n  }\n}\n',
  '.mcp.json':
    '{\n  "mcpServers": {\n    "postgres": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-postgres"] }\n  }\n}\n',
  '.claude/settings.json':
    '{\n  "permissions": {\n    "deny": ["Read(./.env)", "Read(./.env.*)"]\n  },\n  "hooks": {\n    "PreToolUse": [\n      {\n        "matcher": "Bash",\n        "hooks": [\n          { "type": "command", "command": ".claude/hooks/block-force-push.sh" },\n          { "type": "command", "command": ".claude/hooks/block-publish.sh" },\n          { "type": "command", "command": ".claude/hooks/protect-env.sh" }\n        ]\n      }\n    ]\n  }\n}\n',
  '.claude/hooks/block-publish.sh': '#!/bin/sh\n# Refuses npm publish.\ngrep -q "npm publish" && exit 2\nexit 0\n',
  '.claude/hooks/protect-env.sh': '#!/bin/sh\n# Refuses edits to .env files.\nexit 0\n',
  ...Object.fromEntries(RULE_NAMES.map((name) => [`.claude/rules/${name}.md`, rule(name)])),
  ...Object.fromEntries(
    SKILL_NAMES.flatMap((name) => [
      [`.claude/skills/${name}/SKILL.md`, skill(name)],
      [`.agents/skills/${name}/SKILL.md`, skill(name)],
    ]),
  ),
  '.claude/agents/reviewer.md': reviewer('Read, Grep, Glob'),
  '.agents/agents/reviewer.md': reviewer('Read, Grep, Glob, Bash'),
  '.claude/agents/planner.md': planner,
  '.agents/agents/planner.md': planner,
  '.githooks/pre-commit': '#!/bin/sh\npnpm lint\n',
  '.githooks/pre-push': '#!/bin/sh\npnpm typecheck && pnpm test\n',
  ...Object.fromEntries(WORKFLOW_NAMES.map((name) => [`.github/workflows/${name}.yml`, workflow(name)])),
});

/** The example's disk behind the scanner's three-method port. O(files × depth) once. */
export function examplePort(files: Readonly<Record<string, string>> = EXAMPLE_FILES): HarnessScanPort {
  const dirs = new Map<string, Map<string, 'file' | 'directory'>>();
  for (const path of Object.keys(files)) {
    const parts = path.split('/');
    parts.forEach((name, index) => {
      const dir = parts.slice(0, index).join('/');
      const entries = dirs.get(dir) ?? new Map<string, 'file' | 'directory'>();
      entries.set(name, index === parts.length - 1 ? 'file' : 'directory');
      dirs.set(dir, entries);
    });
  }
  const encoder = new TextEncoder();
  return {
    async listDir(path) {
      const entries = dirs.get(path);
      return entries ? [...entries].map(([name, kind]) => ({ name, kind })) : null;
    },
    async readText(path) {
      const text = files[path];
      return text === undefined ? null : { text, lastModified: null, bytes: encoder.encode(text).length };
    },
    async pathExists(path) {
      return path in files || dirs.has(path);
    },
  };
}

export interface ExampleRead {
  report: HarnessReport;
  progress: readonly HarnessScanProgress[];
}

export async function readExample(): Promise<ExampleRead> {
  const progress: HarnessScanProgress[] = [];
  const report = await scanHarness(examplePort(), { onProgress: (event) => progress.push({ ...event }) });
  return { report, progress };
}
