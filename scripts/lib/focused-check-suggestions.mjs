const RULES = [
  {
    command: 'pnpm test:mcp:registration',
    reason: 'MCP source-checkout registration templates changed',
    matches: [/^\.mcp\.json(?:\.example)?$/],
  },
  {
    command: 'pnpm docs-vault:check',
    reason: 'dogfood ontology docs or generated manifest changed',
    matches: [/^docs\/ontology\//, /^src\/entities\/docs-vault\/data\/manifest\.json$/],
  },
  {
    command: 'pnpm test:docs-vault',
    reason: 'docs-vault build/check helper changed',
    matches: [/^scripts\/build-docs-vault\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:vault:validate',
    reason: 'vault validator script changed',
    matches: [/^scripts\/validate-vault(?:-script)?\.test\.mjs$/, /^scripts\/validate-vault\.mjs$/],
  },
  {
    command: 'pnpm test:vault:audit',
    reason: 'vault path audit script changed',
    matches: [/^scripts\/audit-vault-paths\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:contracts',
    reason: 'cross-package parser/schema/validator contract changed',
    matches: [
      /^tests\/contract\//,
      /^tests\/fixtures\/(?:frontmatter|frontmatter-writer|validate-vault)-cases\.mjs$/,
      /^mcp\/src\/(?:parser|schema|validate)\.mjs$/,
      /^cli\/src\/lib\/(?:parse-frontmatter|schema|validate)\.mjs$/,
      /^cli\/src\/commands\/validate\.mjs$/,
      /^scripts\/lib\/parse-frontmatter\.mjs$/,
      /^scripts\/migrations\/2026-05-04-trim-frontmatter-values\.mjs$/,
      /^src\/shared\/lib\/(?:parse-frontmatter|validate-vault-document)\.ts$/,
    ],
  },
  {
    command: 'pnpm test:mcp:unit',
    reason: 'MCP core unit implementation changed',
    matches: [
      /^mcp\/src\/(?:analyze|infer-imports|omot-ignore|ontology-compiler|ontology-engine|parser|query|validate|vault|index)\.(?:mjs|js)$/,
      /^mcp\/src\/(?:analyze|infer-imports|omot-ignore|ontology-compiler|ontology-engine|parser|query|validate|vault|redirect-backlinks|conflict-detection|json-rpc-lines)\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:dogfood:script-refs',
    reason: 'help text, package-script references, or focused wrapper behavior changed',
    matches: [
      /^package\.json$/,
      /^scripts\/lib\/pnpm-script-refs\.(?:mjs|test\.mjs)$/,
      /^scripts\/run-focused-node-test\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    command: 'pnpm test:dogfood:args',
    reason: 'dogfood shortcut argument helper changed',
    matches: [/^scripts\/lib\/dogfood-args\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:dogfood:compile-fix',
    reason: 'dogfood compile-fix idempotence helper changed',
    matches: [/^scripts\/dogfood-compile-fix\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:checks:changed',
    reason: 'changed-path focused-check advisor changed',
    matches: [
      /^scripts\/lib\/focused-check-suggestions\.(?:mjs|test\.mjs)$/,
      /^scripts\/suggest-focused-checks\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    command: 'pnpm test:dogfood:status',
    reason: 'dogfood status shortcut changed',
    matches: [/^scripts\/dogfood-status\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:dogfood',
    reason: 'MCP dogfood helper changed',
    matches: [/^scripts\/dogfood-mcp-walk\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:verify',
    reason: 'MCP verify helper changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:maintenance',
    reason: 'maintenance_plan queue or formatter behavior changed',
    matches: [/^cli\/src\/commands\/maintenance\.mjs$/, /^scripts\/dogfood-status\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:suggestions',
    reason: 'MCP enum or argument suggestion behavior changed',
    matches: [/^mcp\/src\/suggestions\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:args',
    reason: 'CLI argument parser changed',
    matches: [/^cli\/src\/lib\/cli-args\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:mcp-call',
    reason: 'CLI MCP response wrapper changed',
    matches: [/^cli\/src\/lib\/mcp-call\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:lib',
    reason: 'CLI shared helper changed',
    matches: [/^cli\/src\/lib\//],
  },
  {
    command: 'pnpm integration:cli:compile',
    reason: 'CLI compile command changed',
    matches: [/^cli\/src\/commands\/compile\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:mcp-verify',
    reason: 'CLI mcp-verify command changed',
    matches: [/^cli\/src\/commands\/mcp-verify\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:growth',
    reason: 'CLI growth command changed',
    matches: [/^cli\/src\/commands\/growth\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:maintenance',
    reason: 'CLI maintenance command changed',
    matches: [/^cli\/src\/commands\/maintenance\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:package',
    reason: 'package or release contract changed',
    matches: [
      /^package\.json$/,
      /^mcp\/package\.json$/,
      /^cli\/package\.json$/,
      /^scripts\/check-package-contracts\.(?:mjs|test\.mjs)$/,
      /^scripts\/smoke-packed-cli\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:mcp:docs',
    reason: 'public docs or dogfood ontology docs changed',
    matches: [
      /^README\.md$/,
      /^AGENTS\.md$/,
      /^CLAUDE\.md$/,
      /^docs\/DEVELOPMENT-CHECKS\.md$/,
      /^docs\/CHANGELOG\.md$/,
      /^docs\/ontology\//,
      /^mcp\/README\.md$/,
      /^cli\/README\.md$/,
      /^firebase\.json$/,
    ],
  },
  {
    command: 'pnpm dogfood:status',
    reason: 'dogfood ontology or MCP/CLI dogfood surface changed',
    matches: [/^docs\/ontology\//, /^mcp\//, /^cli\//, /^scripts\/dogfood/],
  },
];

const ESCALATIONS = [
  {
    command: 'pnpm package:check',
    reason: 'package manifests, docs contracts, or release scripts changed',
    matches: [
      /^package\.json$/,
      /^mcp\/package\.json$/,
      /^cli\/package\.json$/,
      /^scripts\/check-package-contracts\.(?:mjs|test\.mjs)$/,
      /^scripts\/smoke-packed-cli\.mjs$/,
    ],
  },
  {
    command: 'pnpm dogfood:verify',
    reason: 'shared MCP/CLI verification surface changed',
    matches: [/^mcp\//, /^cli\/src\/commands\/mcp-verify\.mjs$/, /^scripts\/smoke-packed-cli\.mjs$/],
  },
];

export function normalizeChangedPath(path) {
  return String(path || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

export function suggestFocusedChecks(paths = []) {
  const normalizedPaths = [...new Set(paths.map(normalizeChangedPath).filter(Boolean))];
  const commands = rulesToSuggestions(RULES, normalizedPaths);
  const escalations = rulesToSuggestions(ESCALATIONS, normalizedPaths);
  return { paths: normalizedPaths, commands, escalations };
}

function rulesToSuggestions(rules, paths) {
  const seen = new Set();
  const suggestions = [];
  for (const rule of rules) {
    const matchedPaths = paths.filter((path) => rule.matches.some((pattern) => pattern.test(path)));
    if (matchedPaths.length === 0 || seen.has(rule.command)) continue;
    seen.add(rule.command);
    suggestions.push({ command: rule.command, reason: rule.reason, paths: matchedPaths });
  }
  return suggestions;
}

export function formatFocusedCheckSuggestions({ paths = [], commands = [], escalations = [] } = {}) {
  if (paths.length === 0) {
    return [
      '[focused-checks] no changed paths against HEAD or untracked files',
      'Use `pnpm checks:changed -- <path...>` to inspect a planned file set.',
    ].join('\n');
  }
  const lines = [
    `[focused-checks] ${paths.length} changed path${paths.length === 1 ? '' : 's'}`,
  ];
  if (commands.length === 0) {
    lines.push('First checks: no focused mapping; choose the nearest area from docs/DEVELOPMENT-CHECKS.md.');
  } else {
    lines.push('First checks:');
    for (const suggestion of commands) {
      lines.push(`  ${suggestion.command}  # ${suggestion.reason}`);
    }
  }
  if (escalations.length > 0) {
    lines.push('Escalate when needed:');
    for (const suggestion of escalations) {
      lines.push(`  ${suggestion.command}  # ${suggestion.reason}`);
    }
  }
  return lines.join('\n');
}
