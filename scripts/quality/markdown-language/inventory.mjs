const HANGUL = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/gu;

/*
 * Typed locale data in leading frontmatter, the one place Korean is authored rather than written
 * as contributor prose. `display_ko` names a node in the reader's language; `summary_<role>_<ko>`
 * does the same for one architecture role, and the locale is matched by shape (two letters) for
 * the same reason both profile parsers match it that way: a vault file outlives the locale list
 * this build happens to ship. Anything else carrying Hangul is still counted as a violation.
 */
const TYPED_LOCALE_KEY = /^(?:display|summary_[a-z][a-z0-9-]*)_[a-z]{2}\s*:/;
/** `- Focused test: `path#title`` on an element's Evidence list, title quoted from a test file. */
const QUOTED_EVIDENCE_COORDINATE = /^\s*-\s*Focused test:\s*(`[^`\n]+#[^`\n]+`)\s*$/;

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
    quotedEvidenceLines: 0,
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
    quotedEvidenceLines: 0,
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
      if (inLeadingFrontmatter && TYPED_LOCALE_KEY.test(line)) {
        result.allowedLocaleLines += 1;
        continue;
      }
      // A focused-test coordinate quotes a test title from source. When that
      // title is Korean, the Hangul is quoted evidence, the same class as the
      // path beside it, not contributor-facing prose: `docs:language` held
      // these at zero and thirteen vault elements could cite no test at all
      // (2026-09-04). Only the exact bullet shape qualifies, only when every
      // Hangul code point sits inside the backticks, and the lines are counted
      // under their own ratchet so the carve-out cannot widen into prose.
      if (!inLeadingFrontmatter && QUOTED_EVIDENCE_COORDINATE.test(line)) {
        const quoted = line.match(QUOTED_EVIDENCE_COORDINATE)[1];
        const outside = line.replace(quoted, '');
        if (![...outside.matchAll(HANGUL)].length) {
          result.quotedEvidenceLines += 1;
          scope.quotedEvidenceLines += 1;
          continue;
        }
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
