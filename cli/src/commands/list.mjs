import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { walkMd, pathToSlug } from '../lib/walk-vault.mjs';

const COLORS = {
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const KIND_COLORS = {
  project: '\x1b[35m',
  domain: '\x1b[34m',
  capability: '\x1b[36m',
  element: '\x1b[32m',
  document: '\x1b[37m',
  'vault-readme': '\x1b[2m',
};

/**
 * R11 #32 — \`oh-my-ontology list [vault]\`
 *
 * vault 의 ontology 노드 (frontmatter `kind:` 있는 .md) 를 표 형태로 출력.
 * --kind <kind> 필터, --json 머신 가독 출력.
 */
export function runList(args) {
  const vaultPath = resolve(args.find((a) => !a.startsWith('--')) || '.');
  const kindFilter = pickFlag(args, '--kind');
  const asJson = args.includes('--json');

  const files = walkMd(vaultPath);
  const nodes = [];
  for (const f of files) {
    let raw;
    try {
      raw = readFileSync(f, 'utf-8');
    } catch {
      continue;
    }
    const { frontmatter } = parseFrontmatter(raw);
    const kind = typeof frontmatter.kind === 'string' ? frontmatter.kind : null;
    if (!kind) continue;
    if (kindFilter && kind !== kindFilter) continue;
    nodes.push({
      slug: pathToSlug(vaultPath, f),
      kind,
      title:
        (typeof frontmatter.title === 'string' && frontmatter.title) ||
        (typeof frontmatter.name === 'string' && frontmatter.name) ||
        '',
      domain:
        typeof frontmatter.domain === 'string' ? frontmatter.domain : '',
    });
  }
  nodes.sort((a, b) =>
    a.kind === b.kind ? a.slug.localeCompare(b.slug) : a.kind.localeCompare(b.kind),
  );

  if (asJson) {
    process.stdout.write(
      JSON.stringify({ vaultPath, total: nodes.length, nodes }, null, 2) + '\n',
    );
    return 0;
  }

  if (nodes.length === 0) {
    console.log(
      `${COLORS.dim}[oh-my-ontology] ${vaultPath} 에서 ontology 노드 0 — vault 가 비었거나 frontmatter \`kind:\` 가 없는 듯.${COLORS.reset}`,
    );
    return 0;
  }

  console.log(
    `${COLORS.bold}${vaultPath}${COLORS.reset} ${COLORS.dim}— ${nodes.length} ontology 노드${kindFilter ? ` (kind=${kindFilter})` : ''}${COLORS.reset}\n`,
  );
  for (const n of nodes) {
    const color = KIND_COLORS[n.kind] || '';
    const kindCol = `${color}${n.kind.padEnd(13)}${COLORS.reset}`;
    const slugCol = n.slug.padEnd(45);
    const titleCol = n.title || COLORS.dim + '(no title)' + COLORS.reset;
    console.log(`  ${kindCol} ${slugCol} ${titleCol}`);
  }
  return 0;
}

function pickFlag(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}
