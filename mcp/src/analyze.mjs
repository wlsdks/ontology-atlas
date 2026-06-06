// R16 (b3) — analyze_repo_structure
//
// AI agent (Claude Code, Codex, Cursor) 가 사용자 한 줄 "이 codebase 분석해줘"
// 후 호출할 *deterministic* 도구. side effect 0 — vault 변경 안 함, 후보만
// 제안. agent 가 사용자에게 보여주고 *명시 add_concept* 호출.
//
// 단일 source of truth 보존:
//   - 결과는 return only. vault frontmatter 직접 안 건드림.
//   - 사용자 검토 + 명시 add 로만 vault 진입 → drift 0.
//
// 감지 패턴 (generic — 80% codebase cover. 더 정교한 framework 별 detect 는
// 후속 도구 — infer_imports / extract_domains_from_readme 등):
//   - package.json `name` → project slug + title
//   - README.md 첫 H1 → project title (package.json 없으면 fallback)
//   - README.md H2 sections → domain 후보
//   - src/ (또는 root) 깊이 1 폴더 → capability 후보 (단 dotfile / 일반 무시
//     폴더 제외)
//   - 각 capability 폴더의 main file (index.ts/js/mjs/tsx) → element 후보
//
// 결과 shape:
//   {
//     rootPath, framework: 'fsd' | 'next' | 'generic',
//     project?: { slug, title },
//     domains: [{ slug, title, evidence: { source, line? } }],
//     capabilities: [{ slug, title, evidence: { source } }],
//     elements: [{ slug, title, evidence: { source } }],
//     meaningGate: {
//       policy: 'business-first',
//       sourceStructureRole: 'implementation-evidence',
//       businessOntology: { domains: [slug], capabilities: [slug], evidence: [{ slug, kind, source }] },
//       implementationEvidence: { elements: [slug], reviewRequiredCapabilities: [{ slug, reason, evidence }] },
//       reviewQuestions: [string],
//     },
//     suggestedRelations: [{ from, to, type }],
//     skipped: [{ path, reason }],
//   }

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

const DEFAULT_IGNORE = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  '.next',
  '.expo',
  '.turbo',
  '.cache',
  '.idea',
  '.vscode',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
]);

const SOURCE_FOLDERS = ['src', 'lib', 'app', 'packages'];
const IGNORE_ARRAY_MAX_ITEMS = 200;

const ELEMENT_ENTRY_FILES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.mjs',
  'main.ts',
  'main.js',
];

/**
 * 한 codebase 의 root 를 walk + README 분석 → ontology node 후보 list.
 *
 * @param {string} rootPath — 분석할 디렉토리 (보통 cwd 또는 user-provided).
 * @param {{ maxDepth?: number, ignore?: string[] }} options
 * @returns analysis result
 */
export function analyzeRepoStructure(rootPath, options = {}) {
  validateRootPath(rootPath);
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw new Error(`rootPath not a directory: ${rootPath}`);
  }
  const maxDepth = optionalNonNegativeInteger(options.maxDepth, 'maxDepth', { max: 10 }) ?? 2;
  const ignore = new Set([
    ...DEFAULT_IGNORE,
    ...optionalStringArray(options.ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS }),
  ]);

  const skipped = [];
  const project = detectProject(rootPath, skipped);
  const { domains, readmePath } = detectDomainsFromReadme(rootPath);
  const existingOntologyEvidence = detectExistingOntologyEvidence(rootPath, skipped);
  const domainSlugsByTail = new Map(
    domains.map((domain) => [tailSlug(domain.slug), domain.slug]),
  );

  // SOURCE_FOLDERS 중 첫 번째 존재하는 것을 src dir 로
  let srcDir = null;
  for (const cand of SOURCE_FOLDERS) {
    const p = join(rootPath, cand);
    if (existsSync(p) && statSync(p).isDirectory()) {
      srcDir = p;
      break;
    }
  }

  // framework heuristic — *features/* 만 있어도 fsd 로 (ontology-atlas 자체
  // 같이 lean FSD). 둘 이상 marker 면 strong fsd.
  let framework = 'generic';
  const fsdMarkers = ['features', 'entities', 'widgets', 'shared', 'views'];
  if (srcDir) {
    const subs = readdirSync(srcDir).filter((s) =>
      statSync(join(srcDir, s)).isDirectory(),
    );
    const fsdHits = subs.filter((s) => fsdMarkers.includes(s)).length;
    if (fsdHits >= 1) framework = 'fsd';
  }
  if (existsSync(join(rootPath, 'next.config.js')) || existsSync(join(rootPath, 'next.config.ts'))) {
    framework = framework === 'fsd' ? 'fsd' : 'next';
  }

  const capabilities = [];
  const elements = [];

  if (srcDir) {
    // FSD pattern — features/ 가 capability 의 main 영역
    const fsdRoots =
      framework === 'fsd'
        ? ['features', 'entities', 'widgets', 'views']
        : null;

    if (fsdRoots) {
      for (const r of fsdRoots) {
        const dir = join(srcDir, r);
        if (!existsSync(dir)) continue;
        for (const sub of readdirSync(dir)) {
          if (ignore.has(sub) || sub.startsWith('.')) {
            skipped.push({ path: join(dir, sub), reason: 'dotfile/ignore' });
            continue;
          }
          const subPath = join(dir, sub);
          if (!statSync(subPath).isDirectory()) continue;
          // features/ 와 entities/ 의 sub 는 capability 후보, widgets/views 는
          // element 후보 (FSD 정의)
          const isCapabilityish = r === 'features' || r === 'entities';
          const slug = isCapabilityish
            ? `capabilities/${sub}`
            : `elements/${relative(rootPath, subPath)}`;
          const evidence = {
            source: relative(rootPath, subPath),
          };
          if (isCapabilityish) {
            capabilities.push({
              slug,
              title: humanize(sub),
              ...(domainSlugsByTail.has(slugify(sub))
                ? { domain: domainSlugsByTail.get(slugify(sub)) }
                : {}),
              evidence,
            });
          } else {
            elements.push({
              slug,
              title: humanize(sub),
              evidence,
            });
          }
        }
      }
    } else {
      // generic — src/ 의 깊이 1 폴더 만
      for (const sub of readdirSync(srcDir)) {
        if (ignore.has(sub) || sub.startsWith('.')) {
          skipped.push({ path: join(srcDir, sub), reason: 'dotfile/ignore' });
          continue;
        }
        const subPath = join(srcDir, sub);
        if (!statSync(subPath).isDirectory()) continue;
        capabilities.push({
          slug: `capabilities/${sub}`,
          title: humanize(sub),
          ...(domainSlugsByTail.has(slugify(sub))
            ? { domain: domainSlugsByTail.get(slugify(sub)) }
            : {}),
          evidence: { source: relative(rootPath, subPath) },
        });
        // index 파일이 있으면 element 추가
        for (const entry of ELEMENT_ENTRY_FILES) {
          const ep = join(subPath, entry);
          if (existsSync(ep)) {
            elements.push({
              slug: `elements/${relative(rootPath, ep)}`,
              title: `${humanize(sub)} entry`,
              evidence: { source: relative(rootPath, ep) },
            });
            break;
          }
        }
      }
    }
  }

  // suggested relations:
  //   - 각 capability → project (capabilities[]) endorse 후보
  //   - 각 capability 의 첫 element → element relation
  const suggestedRelations = [];
  if (project) {
    for (const cap of capabilities) {
      suggestedRelations.push({
        from: project.slug,
        to: cap.slug,
        type: 'contains',
      });
    }
  }
  if (maxDepth > 0); // reserved for deeper element walking

  void readmePath; // signal used

  return {
    rootPath,
    framework,
    project,
    domains,
    capabilities,
    elements,
    meaningGate: buildMeaningGate({
      domains,
      capabilities,
      elements,
      existingOntologyEvidence,
    }),
    suggestedRelations,
    skipped,
  };
}

function buildMeaningGate({ domains, capabilities, elements, existingOntologyEvidence }) {
  const existingBySlug = new Map(
    existingOntologyEvidence.map((evidence) => [evidence.slug, evidence]),
  );
  const existingDomainEvidence = existingOntologyEvidence.filter((evidence) => evidence.kind === 'domain');
  const businessDomains = [
    ...new Set([
      ...domains.map((domain) => domain.slug),
      ...existingDomainEvidence.map((evidence) => evidence.slug),
    ]),
  ];
  const existingByElement = new Map();
  for (const evidence of existingOntologyEvidence) {
    if (evidence.kind !== 'capability') continue;
    for (const element of evidence.elements ?? []) {
      if (!existingByElement.has(element)) existingByElement.set(element, evidence);
    }
  }
  const existingEvidenceByCandidateSlug = new Map();
  const evidenceByBusinessCapabilitySlug = new Map();
  const businessCapabilities = capabilities.flatMap((capability) => {
    const evidence = existingBySlug.get(capability.slug) ?? existingByElement.get(capability.evidence.source);
    if (evidence) {
      existingEvidenceByCandidateSlug.set(capability.slug, evidence);
      evidenceByBusinessCapabilitySlug.set(evidence.slug, evidence);
      return [evidence.slug];
    }
    if (capability.domain) return [capability.slug];
    return [];
  });
  const businessCapabilitySet = new Set(businessCapabilities);
  const matchedCapabilityCandidateSlugs = new Set(
    [...existingEvidenceByCandidateSlug.keys()].filter(Boolean),
  );
  const reviewRequiredCapabilities = capabilities
    .filter(
      (capability) =>
        !capability.domain &&
        !existingBySlug.has(capability.slug) &&
        !matchedCapabilityCandidateSlugs.has(capability.slug),
    )
    .map((capability) => ({
      slug: capability.slug,
      reason: 'no README/domain evidence for business meaning',
      evidence: capability.evidence,
    }));
  const businessEvidence = uniqueEvidenceRows([
    ...domains.map((domain) => ({
      slug: domain.slug,
      kind: 'domain',
      source: domain.evidence.source,
    })),
    ...existingDomainEvidence.map(formatOntologyEvidence),
    ...businessCapabilities.flatMap((capability) => {
      const existing = existingBySlug.get(capability) ?? evidenceByBusinessCapabilitySlug.get(capability);
      if (existing) return [formatOntologyEvidence(existing)];
      return [
        {
          slug: capability,
          kind: 'capability',
          source: capabilities.find((candidate) => candidate.slug === capability)?.evidence.source ?? capability,
        },
      ];
    }),
  ]);

  return {
    policy: 'business-first',
    sourceStructureRole: 'implementation-evidence',
    businessOntology: {
      domains: businessDomains,
      capabilities: [...businessCapabilitySet],
      evidence: businessEvidence,
    },
    implementationEvidence: {
      elements: elements.map((element) => element.slug),
      reviewRequiredCapabilities,
    },
    reviewQuestions: [
      'What business/product outcome, user workflow, ownership boundary, or decision does this node explain?',
      'Which source path, README heading, import edge, or file-level element proves the implementation evidence?',
      'Should this code structure stay evidence-only instead of becoming a domain or capability node?',
    ],
  };
}

function formatOntologyEvidence(evidence) {
  return {
    slug: evidence.slug,
    kind: evidence.kind,
    source: evidence.source,
  };
}

function uniqueEvidenceRows(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = `${row.slug}\0${row.kind}\0${row.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

function detectProject(rootPath, skipped = []) {
  const pkgPath = join(rootPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const slugRaw = String(pkg.name || basename(rootPath));
      const slug = slugRaw.replace(/^@/, '').replace(/\//g, '-');
      const title =
        (typeof pkg.description === 'string' && pkg.description.trim()) ||
        humanize(slug);
      return { slug, title };
    } catch (err) {
      skipped.push({
        path: pkgPath,
        reason: `package-json-parse-error: ${err.message}`,
      });
    }
  }
  // README first H1
  for (const cand of ['README.md', 'readme.md', 'README']) {
    const p = join(rootPath, cand);
    if (!existsSync(p)) continue;
    try {
      const text = readFileSync(p, 'utf-8');
      const m = text.match(/^#\s+(.+?)\s*$/m);
      if (m) {
        const title = m[1].trim();
        return { slug: basename(rootPath), title };
      }
    } catch {
      // ignore
    }
  }
  return { slug: basename(rootPath), title: humanize(basename(rootPath)) };
}

function detectExistingOntologyEvidence(rootPath, skipped = []) {
  const ontologyRoot = join(rootPath, 'docs', 'ontology');
  if (!existsSync(ontologyRoot) || !statSync(ontologyRoot).isDirectory()) {
    return [];
  }
  const rows = [];
  const seen = new Set();

  function visit(dir) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      let stat;
      try {
        stat = statSync(path);
      } catch (err) {
        skipped.push({ path, reason: `ontology-stat-error: ${err.message}` });
        continue;
      }
      if (stat.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.endsWith('.md')) continue;
      const evidence = readOntologyEvidence(rootPath, ontologyRoot, path);
      if (!evidence || seen.has(evidence.slug)) continue;
      seen.add(evidence.slug);
      rows.push(evidence);
    }
  }

  visit(ontologyRoot);
  return rows;
}

function readOntologyEvidence(rootPath, ontologyRoot, path) {
  let text;
  try {
    text = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  const frontmatter = parseSimpleFrontmatter(text);
  const kind = frontmatter.kind;
  if (kind !== 'domain' && kind !== 'capability') return null;
  const source = relative(rootPath, path);
  const slug = frontmatter.slug || relative(ontologyRoot, path).replace(/\.md$/i, '');
  return { slug, kind, source, elements: frontmatter.elements ?? [] };
}

function parseSimpleFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = text.slice(4, end).trim();
  const frontmatter = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (!value) {
      const items = [];
      let j = i + 1;
      while (j < lines.length) {
        const item = lines[j].match(/^\s+-\s+(.+)$/);
        if (!item) break;
        items.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
        j += 1;
      }
      if (items.length > 0) {
        frontmatter[key] = items;
        i = j - 1;
      }
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      continue;
    }
    frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
  }
  return frontmatter;
}

function detectDomainsFromReadme(rootPath) {
  const candidates = ['README.md', 'readme.md', 'README'];
  for (const cand of candidates) {
    const p = join(rootPath, cand);
    if (!existsSync(p)) continue;
    try {
      const text = readFileSync(p, 'utf-8');
      const lines = text.split(/\r?\n/);
      const domains = [];
      const seen = new Set();
      for (let i = 0; i < lines.length; i += 1) {
        const m = lines[i].match(/^##\s+(.+?)\s*$/);
        if (!m) continue;
        const title = m[1].trim();
        // README H2 is a heuristic domain source. Skip headers that are almost
        // never real codebase domains and only add bootstrap noise: generic doc
        // sections, narrative / question-style headers ("Why It Exists"),
        // language-guide headers ("한국어 가이드"), and sentence-like headers
        // ("Three views plus MCP, one vault").
        const wordCount = title.split(/\s+/).filter(Boolean).length;
        if (
          // generic doc sections (exact match)
          /^(usage|installation|getting started|quick start|license|contributing|requirements|features|setup|status|tech stack|architecture|folder map|routes|tests?|documentation|overview|development|deployment|changelog|roadmap|faq|demo|examples?|guides?|table of contents|toc|acknowledge?ments?)$/i.test(
            title,
          ) ||
          // narrative / question-style headers
          /^(why|what|how|when|where|who)\b/i.test(title) ||
          // language-guide / translation section headers
          /가이드|\bguide\b/i.test(title) ||
          // sentence-like headers (clause separator or long phrase)
          title.includes(',') ||
          wordCount > 5
        ) {
          continue;
        }
        const rawSlug = slugify(title);
        if (!rawSlug) continue;
        const slug = `domains/${rawSlug}`;
        if (seen.has(slug)) continue;
        seen.add(slug);
        domains.push({
          slug,
          title,
          evidence: { source: cand, line: i + 1 },
        });
        if (domains.length >= 12) break; // sanity cap
      }
      return { domains, readmePath: p };
    } catch {
      // ignore
    }
  }
  return { domains: [], readmePath: null };
}

function humanize(s) {
  return s
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function tailSlug(slug) {
  return String(slug).split('/').filter(Boolean).at(-1) ?? '';
}

function validateRootPath(rootPath) {
  if (typeof rootPath !== 'string' || !rootPath.trim()) {
    throw new Error('rootPath must be a non-empty string.');
  }
  if (rootPath.trim() !== rootPath) {
    throw new Error('rootPath must not have leading or trailing whitespace.');
  }
  if (rootPath.includes('\0')) {
    throw new Error('rootPath must not contain a null byte.');
  }
}

function optionalNonNegativeInteger(value, name, options = {}) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }
  return value;
}

function optionalStringArray(value, name, options = {}) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${name} must be an array of strings.`);
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new Error(`${name} must contain at most ${options.max} items.`);
  }
  return value.map((item) => {
    const trimmed = item.trim();
    if (!trimmed) {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (trimmed !== item) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (trimmed.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
    return trimmed;
  });
}
