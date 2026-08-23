const HANGUL = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/gu;

const OPERATIONAL_PATHS = new Set([
  'AGENTS.md',
  'CLAUDE.md',
]);

const HISTORICAL_PATHS = new Set([
  'docs/DECISIONS.md',
  'docs/CHANGELOG.md',
  'cli/CHANGELOG.md',
  'mcp/CHANGELOG.md',
]);

const HISTORICAL_DOC_PREFIX = /^docs\/(?:archive|plans|audits|prototypes)\//;

function canonicalScope(path) {
  if (
    OPERATIONAL_PATHS.has(path)
    || path.startsWith('.claude/rules/')
    || path.startsWith('.claude/skills/')
    || path.startsWith('.claude/agents/')
  ) {
    return 'operational';
  }
  if (HISTORICAL_PATHS.has(path) || HISTORICAL_DOC_PREFIX.test(path)) {
    return 'historical';
  }
  return 'current';
}

export function classifyMarkdownPath(path) {
  if (path.startsWith('public/docs-vault/')) {
    return { kind: 'generated', scope: null };
  }
  if (path.startsWith('.agents/')) {
    return { kind: 'mirror', scope: null };
  }
  if (path.startsWith('cli/templates/vault-ko/')) {
    return { kind: 'locale-template', scope: null };
  }
  return { kind: 'canonical', scope: canonicalScope(path) };
}

function emptyScopeSummary() {
  return {
    scannedFiles: 0,
    scannedBytes: 0,
    unexpectedFiles: 0,
    unexpectedLines: 0,
    unexpectedHangulCodePoints: 0,
  };
}

export function auditMarkdownEntries(entries) {
  const result = {
    scannedFiles: 0,
    scannedBytes: 0,
    skippedFiles: 0,
    generatedFiles: 0,
    mirrorFiles: 0,
    localeTemplateFiles: 0,
    allowedLocaleLines: 0,
    unexpectedFiles: 0,
    unexpectedLines: 0,
    unexpectedHangulCodePoints: 0,
    scopes: {
      operational: emptyScopeSummary(),
      current: emptyScopeSummary(),
      historical: emptyScopeSummary(),
    },
    violations: [],
  };

  for (const entry of entries) {
    const classification = classifyMarkdownPath(entry.path);
    if (classification.kind === 'generated') {
      result.generatedFiles += 1;
      result.skippedFiles += 1;
      continue;
    }
    if (classification.kind === 'mirror') {
      result.mirrorFiles += 1;
      result.skippedFiles += 1;
      continue;
    }
    if (classification.kind === 'locale-template') {
      result.localeTemplateFiles += 1;
      result.skippedFiles += 1;
      continue;
    }

    const scope = result.scopes[classification.scope];
    const bytes = Buffer.byteLength(entry.content);
    result.scannedFiles += 1;
    result.scannedBytes += bytes;
    scope.scannedFiles += 1;
    scope.scannedBytes += bytes;

    let inLeadingFrontmatter = false;
    let fileHasUnexpectedHangul = false;
    const lines = entry.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (index === 0 && line === '---') {
        inLeadingFrontmatter = true;
        continue;
      }
      if (inLeadingFrontmatter && line === '---') {
        inLeadingFrontmatter = false;
        continue;
      }

      const matches = [...line.matchAll(HANGUL)];
      if (matches.length === 0) continue;
      if (inLeadingFrontmatter && /^display_ko\s*:/.test(line)) {
        result.allowedLocaleLines += 1;
        continue;
      }

      fileHasUnexpectedHangul = true;
      result.unexpectedLines += 1;
      result.unexpectedHangulCodePoints += matches.length;
      scope.unexpectedLines += 1;
      scope.unexpectedHangulCodePoints += matches.length;
      result.violations.push({
        path: entry.path,
        line: index + 1,
        count: matches.length,
        scope: classification.scope,
        text: line.trim(),
      });
    }

    if (fileHasUnexpectedHangul) {
      result.unexpectedFiles += 1;
      scope.unexpectedFiles += 1;
    }
  }

  return result;
}
