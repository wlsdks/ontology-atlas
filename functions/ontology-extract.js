// Cloud Functions 측 ontology extraction orchestrator (T-4d/T-4e).
//
// canonical 로직은 TypeScript 에 살아 있다 — 변경 시 두 곳을 같이:
//   - src/shared/lib/ontology-frontmatter/parse.ts          (T-4a)
//   - src/shared/lib/ontology-extraction/validate-output.ts (T-4b)
//   - src/shared/lib/ontology-extraction/build-prompt.ts    (T-4c)
//   - src/shared/lib/ontology-extraction/call-llm.ts        (T-4d)
//
// 본 .js 는 위 모듈들의 논리를 ESM 환경 (functions/) 에서 import 가능한
// 형태로 mirror 한다. 기존 functions/index.js 의 Gemini 경로와는 독립이며,
// extractorVersion 이 "ontology-v1" 같은 ontology- 접두로 시작할 때만 호출.
//
// Note: firebase-functions/v2 logger 는 dynamic import (logExtraction 내부)
// 로 미루어 — 본 모듈이 functions/node_modules 없는 환경 (테스트·typecheck)
// 에서도 로드 가능하도록 한다.

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const KIND_VALUES = ['project', 'domain', 'capability', 'element', 'document'];
const STATUS_VALUES = ['draft', 'active', 'deprecated', 'archived'];
const ELEMENT_TYPE_VALUES = [
  'service',
  'api',
  'agent',
  'workflow',
  'schema',
  'data-store',
  'ui',
  'prompt',
  'integration',
];
const EDGE_TYPE_VALUES = [
  'contains',
  'belongs_to',
  'depends_on',
  'implements',
  'uses',
  'describes',
  'related_to',
];
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REQUIRED_KEYS = ['id', 'kind', 'project', 'title', 'version'];
const RECOMMENDED_KEYS = ['domain', 'status', 'aliases', 'tags'];

const CONFIDENCE_CAP_BY_GRADE = { A: 1.0, B: 0.84, C: 0.59 };

const MODEL_PRICING = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
};

// ─────────────────────────────────────────────────────────────────────────────
// T-4a — frontmatter parser (JS mirror)
// ─────────────────────────────────────────────────────────────────────────────

function unquote(value) {
  return value.replace(/^["']|["']$/g, '');
}

function parseInlineArray(value) {
  return value
    .slice(1, -1)
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function splitFrontmatterBlock(md) {
  if (!md.startsWith('---')) return null;
  const end = md.indexOf('\n---', 3);
  if (end === -1) return null;
  const rawFrontmatter = md.slice(4, end).trim();
  const body = md.slice(end + 4).replace(/^[\r\n]+/, '');
  return { rawFrontmatter, body };
}

function parseRelatesBlock(lines, startIdx) {
  const out = [];
  const warnings = [];
  let i = startIdx;
  let consumed = 0;
  let current = null;

  function flush() {
    if (!current) return;
    if (!current.type || !current.target) {
      warnings.push('relates: 항목 누락 (type 또는 target). 무시됨.');
    } else if (!EDGE_TYPE_VALUES.includes(current.type)) {
      warnings.push(`relates: 알 수 없는 edge type "${current.type}". 무시됨.`);
    } else {
      out.push(current);
    }
    current = null;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.match(/^\s+/)) break;
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      consumed++;
      continue;
    }
    if (trimmed.startsWith('- ')) {
      flush();
      current = {};
      const inline = trimmed.slice(2).trim();
      if (inline) {
        const colonIdx = inline.indexOf(':');
        if (colonIdx > 0) {
          const k = inline.slice(0, colonIdx).trim();
          const v = unquote(inline.slice(colonIdx + 1).trim());
          if (k === 'type') current.type = v;
          else if (k === 'target') current.target = v;
          else if (k === 'note') current.note = v;
        }
      }
    } else if (current) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const k = trimmed.slice(0, colonIdx).trim();
        const v = unquote(trimmed.slice(colonIdx + 1).trim());
        if (k === 'type') current.type = v;
        else if (k === 'target') current.target = v;
        else if (k === 'note') current.note = v;
      }
    }
    i++;
    consumed++;
  }
  flush();
  return { consumed, warnings };
}

export function parseOntologyDocument(md) {
  const split = splitFrontmatterBlock(md);
  if (!split) {
    return {
      frontmatter: {},
      body: md,
      grade: 'C',
      warnings: ['frontmatter 블록이 없음. 등급 C (자동 반영 금지) 적용.'],
    };
  }
  const lines = split.rawFrontmatter.split('\n');
  const scalars = {};
  const arrays = {};
  const relates = [];
  const warnings = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const valueRaw = line.slice(colonIdx + 1).trim();
    if (!valueRaw) {
      if (key === 'relates') {
        i++;
        const r = parseRelatesBlock(lines, i);
        relates.push(...(r.out ?? []));
        // parseRelatesBlock returns array via closure; restructure:
        i += r.consumed;
        warnings.push(...r.warnings);
      } else if (key === 'aliases' || key === 'tags') {
        i++;
        const items = [];
        while (i < lines.length) {
          const next = lines[i];
          if (!next.match(/^\s+-\s+/)) break;
          const item = next.replace(/^\s+-\s+/, '').trim();
          if (item) items.push(unquote(item));
          i++;
        }
        arrays[key] = items;
      } else {
        i++;
      }
      continue;
    }
    if (valueRaw.startsWith('[') && valueRaw.endsWith(']')) {
      arrays[key] = parseInlineArray(valueRaw);
    } else {
      scalars[key] = unquote(valueRaw);
    }
    i++;
  }

  // relates 는 위에서 closure 로 추출 못 하므로 별도 두 번째 pass
  // (간단성 우선; performance 차이 무시할 수준).
  const relatesOut = [];
  i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const valueRaw = line.slice(colonIdx + 1).trim();
    if (key === 'relates' && !valueRaw) {
      i++;
      let current = null;
      while (i < lines.length) {
        const ln = lines[i];
        if (!ln.match(/^\s+/)) break;
        const t = ln.trim();
        if (!t) {
          i++;
          continue;
        }
        if (t.startsWith('- ')) {
          if (current && current.type && current.target && EDGE_TYPE_VALUES.includes(current.type)) {
            relatesOut.push(current);
          } else if (current) {
            warnings.push(
              !current.type || !current.target
                ? 'relates: 항목 누락 (type 또는 target). 무시됨.'
                : `relates: 알 수 없는 edge type "${current.type}". 무시됨.`,
            );
          }
          current = {};
          const inline = t.slice(2).trim();
          if (inline) {
            const ci = inline.indexOf(':');
            if (ci > 0) {
              const k = inline.slice(0, ci).trim();
              const v = unquote(inline.slice(ci + 1).trim());
              if (k === 'type') current.type = v;
              else if (k === 'target') current.target = v;
              else if (k === 'note') current.note = v;
            }
          }
        } else if (current) {
          const ci = t.indexOf(':');
          if (ci > 0) {
            const k = t.slice(0, ci).trim();
            const v = unquote(t.slice(ci + 1).trim());
            if (k === 'type') current.type = v;
            else if (k === 'target') current.target = v;
            else if (k === 'note') current.note = v;
          }
        }
        i++;
      }
      if (current && current.type && current.target && EDGE_TYPE_VALUES.includes(current.type)) {
        relatesOut.push(current);
      } else if (current) {
        warnings.push(
          !current.type || !current.target
            ? 'relates: 항목 누락 (type 또는 target). 무시됨.'
            : `relates: 알 수 없는 edge type "${current.type}". 무시됨.`,
        );
      }
    } else {
      i++;
    }
  }

  const fm = {};
  if (scalars.id) {
    if (!ID_PATTERN.test(scalars.id)) {
      warnings.push(`id "${scalars.id}" 가 kebab-case 패턴에 맞지 않음.`);
    }
    fm.id = scalars.id;
  }
  if (scalars.kind) {
    if (KIND_VALUES.includes(scalars.kind)) {
      fm.kind = scalars.kind;
    } else {
      warnings.push(
        `kind "${scalars.kind}" 가 합법값이 아님 (project/domain/capability/element/document).`,
      );
    }
  }
  if (scalars.project) fm.project = scalars.project;
  if (scalars.title) fm.title = scalars.title;
  if (scalars.version !== undefined) {
    const v = Number(scalars.version);
    if (Number.isFinite(v) && v >= 1) fm.version = v;
    else warnings.push(`version "${scalars.version}" 가 유효한 정수가 아님.`);
  }
  if (scalars.domain) fm.domain = scalars.domain;
  if (scalars.status) {
    if (STATUS_VALUES.includes(scalars.status)) fm.status = scalars.status;
    else warnings.push(`status "${scalars.status}" 가 합법값이 아님.`);
  }
  if (scalars.elementType) {
    if (ELEMENT_TYPE_VALUES.includes(scalars.elementType)) fm.elementType = scalars.elementType;
    else warnings.push(`elementType "${scalars.elementType}" 가 9 종 enum 에 없음.`);
  }
  if (arrays.aliases) fm.aliases = arrays.aliases;
  if (arrays.tags) fm.tags = arrays.tags;
  if (relatesOut.length > 0) fm.relates = relatesOut;
  if (fm.id && fm.relates) {
    for (const rel of fm.relates) {
      if (rel.target === fm.id) {
        warnings.push(`relates.target "${rel.target}" 가 자기 자신을 가리킴.`);
      }
    }
  }

  // 등급
  let grade;
  const requiredOk = REQUIRED_KEYS.every((k) => fm[k] !== undefined && fm[k] !== '');
  if (!requiredOk) {
    grade = 'C';
    warnings.push('필수 frontmatter 누락. 등급 C (자동 반영 금지) 적용.');
  } else {
    const recommendedOk = RECOMMENDED_KEYS.every((k) => {
      const v = fm[k];
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== '';
    });
    const elementOk = fm.kind === 'element' ? !!fm.elementType : true;
    grade = recommendedOk && elementOk ? 'A' : 'B';
  }

  return { frontmatter: fm, body: split.body, grade, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// T-4c — prompt builder (JS mirror)
// ─────────────────────────────────────────────────────────────────────────────

function formatClasses(classes) {
  return classes
    .map((c) => {
      const parent = c.parentClassId ? ` (extends ${c.parentClassId})` : '';
      const desc = c.description ? `: ${c.description}` : '';
      return `- \`${c.id}\`${parent}${desc}`;
    })
    .join('\n');
}

function formatRelations(relations) {
  return relations
    .map((r) => {
      const src = (r.sourceClassIds || []).length === 0 ? '*' : r.sourceClassIds.join('|');
      const tgt = (r.targetClassIds || []).length === 0 ? '*' : r.targetClassIds.join('|');
      const props = [r.symmetric ? 'symmetric' : null, r.transitive ? 'transitive' : null]
        .filter(Boolean)
        .join(', ');
      const propsStr = props ? ` [${props}]` : '';
      return `- \`${r.id}\` (${r.category}): ${src} → ${tgt}${propsStr}${
        r.description ? ` — ${r.description}` : ''
      }`;
    })
    .join('\n');
}

function formatFrontmatterFacts(parsed) {
  const fm = parsed.frontmatter;
  const lines = [];
  if (fm.id) lines.push(`- this document declares id = \`${fm.id}\``);
  if (fm.kind) lines.push(`- declared kind = \`${fm.kind}\``);
  if (fm.project) lines.push(`- declared project = \`${fm.project}\``);
  if (fm.title) lines.push(`- declared title = "${fm.title}"`);
  if (fm.domain) lines.push(`- declared domain = \`${fm.domain}\``);
  if (fm.elementType) lines.push(`- declared elementType = \`${fm.elementType}\``);
  if (fm.aliases?.length) {
    lines.push(`- aliases = [${fm.aliases.map((a) => `"${a}"`).join(', ')}]`);
  }
  if (fm.relates?.length) {
    lines.push(`- declared relations (treat as confidence 1.0):`);
    for (const rel of fm.relates) {
      lines.push(`  - ${fm.id ?? '(self)'} \`${rel.type}\` ${rel.target}`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : '(no declared frontmatter)';
}

export function buildExtractionPrompt({ parsedDoc, classes, relations, extractorVersion, documentId }) {
  const cap = CONFIDENCE_CAP_BY_GRADE[parsedDoc.grade];
  const docTrail = documentId ? `documentId=${documentId}, ` : '';
  const system = [
    'You are an ontology extraction assistant. Read a Korean / English markdown',
    'design document and produce a structured graph fragment that matches the',
    "project's ontology TBox.",
    '',
    '## Ontology TBox',
    '',
    '### Node classes (`kind`)',
    formatClasses(classes),
    '',
    '### Relation types (`type`) — source → target constraints',
    formatRelations(relations),
    '',
    '## Output JSON schema',
    '',
    '`{ summary, nodes: [{tempId,title,kind,projectIds[],summary,confidence,elementType?,warnings?,evidence?[]}],',
    '   edges: [{tempId,fromTempId,toTempId,type,label?,confidence,warnings?,evidence?[]}], warnings[] }`',
    '',
    '## Confidence policy',
    '',
    `- Document grade: **${parsedDoc.grade}**. Max confidence cap: **${cap}**.`,
    '- ≥0.85 explicit / 0.60~0.84 contextual / <0.60 weak (use related_to or send to review).',
    '',
    '## Constraints',
    '1. evidence[] required (excerpt ≤ 240 chars) unless confidence < 0.60.',
    '2. edge type respects source/target class constraints.',
    '3. Do NOT invent project IDs — only use IDs from frontmatter or body.',
    '4. Self-loop edges (from == to) forbidden.',
    '5. Output JSON only — no prose, no markdown fences.',
    '',
    `_extractorVersion: ${extractorVersion}, ${docTrail}grade: ${parsedDoc.grade}_`,
  ].join('\n');

  const user = [
    '## Frontmatter facts (already verified, treat as ground truth)',
    '',
    formatFrontmatterFacts(parsedDoc),
    '',
    '## Document body',
    '',
    parsedDoc.body || '(empty)',
    '',
    '## Task',
    '',
    'Extract the ontology fragment described above. Return JSON only.',
  ].join('\n');

  return { system, user, confidenceCap: cap };
}

// ─────────────────────────────────────────────────────────────────────────────
// T-4b — output validator (JS mirror, slimmer)
// ─────────────────────────────────────────────────────────────────────────────

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function validateExtractionOutput(raw) {
  const errors = [];
  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ path: '', message: 'output 이 객체가 아님' }] };
  }
  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  if (typeof raw.summary !== 'string') {
    errors.push({ path: 'summary', message: 'summary 가 string 아님 (빈 값으로 대체)' });
  }
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const nodes = [];
  const seenNodeIds = new Set();
  for (let i = 0; i < rawNodes.length; i++) {
    const n = rawNodes[i];
    if (!isPlainObject(n)) {
      errors.push({ path: `nodes[${i}]`, message: '객체 아님' });
      continue;
    }
    if (typeof n.tempId !== 'string' || !n.tempId) {
      errors.push({ path: `nodes[${i}].tempId`, message: 'tempId 누락' });
      continue;
    }
    if (typeof n.title !== 'string' || !n.title) {
      errors.push({ path: `nodes[${i}].title`, message: 'title 누락' });
      continue;
    }
    if (typeof n.kind !== 'string' || !KIND_VALUES.includes(n.kind)) {
      errors.push({ path: `nodes[${i}].kind`, message: `kind 가 enum 아님 (${n.kind})` });
      continue;
    }
    if (!isStringArray(n.projectIds)) {
      errors.push({ path: `nodes[${i}].projectIds`, message: 'projectIds 가 string[] 아님' });
      continue;
    }
    if (
      typeof n.confidence !== 'number'
      || !Number.isFinite(n.confidence)
      || n.confidence < 0
      || n.confidence > 1
    ) {
      errors.push({
        path: `nodes[${i}].confidence`,
        message: 'confidence 가 [0,1] 유효 숫자 아님',
      });
      continue;
    }
    if (seenNodeIds.has(n.tempId)) {
      errors.push({ path: `nodes[${i}].tempId`, message: `tempId 중복 (${n.tempId})` });
      continue;
    }
    seenNodeIds.add(n.tempId);
    nodes.push({
      tempId: n.tempId,
      title: n.title,
      kind: n.kind,
      projectIds: n.projectIds,
      summary: typeof n.summary === 'string' ? n.summary : '',
      confidence: n.confidence,
      ...(typeof n.elementType === 'string' && ELEMENT_TYPE_VALUES.includes(n.elementType)
        ? { elementType: n.elementType }
        : {}),
      ...(isStringArray(n.warnings) ? { warnings: n.warnings } : {}),
      ...(Array.isArray(n.evidence)
        ? {
            evidence: n.evidence
              .filter(
                (e) => isPlainObject(e) && typeof e.excerpt === 'string' && e.excerpt.length > 0
                  && e.excerpt.length <= 240,
              )
              .map((e) => ({
                excerpt: e.excerpt,
                ...(typeof e.charStart === 'number' ? { charStart: e.charStart } : {}),
                ...(typeof e.charEnd === 'number' ? { charEnd: e.charEnd } : {}),
              })),
          }
        : {}),
    });
  }
  const validIds = new Set(nodes.map((n) => n.tempId));
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const edges = [];
  const seenEdgeIds = new Set();
  for (let i = 0; i < rawEdges.length; i++) {
    const e = rawEdges[i];
    if (!isPlainObject(e)) continue;
    if (typeof e.tempId !== 'string' || !e.tempId) continue;
    if (typeof e.fromTempId !== 'string' || typeof e.toTempId !== 'string') continue;
    if (e.fromTempId === e.toTempId) {
      errors.push({ path: `edges[${i}]`, message: 'self-loop' });
      continue;
    }
    if (!EDGE_TYPE_VALUES.includes(e.type)) {
      errors.push({ path: `edges[${i}].type`, message: `type 이 enum 아님 (${e.type})` });
      continue;
    }
    if (!validIds.has(e.fromTempId) || !validIds.has(e.toTempId)) {
      errors.push({ path: `edges[${i}]`, message: '미지의 노드 참조' });
      continue;
    }
    if (
      typeof e.confidence !== 'number'
      || !Number.isFinite(e.confidence)
      || e.confidence < 0
      || e.confidence > 1
    ) {
      errors.push({
        path: `edges[${i}].confidence`,
        message: 'confidence 가 [0,1] 유효 숫자 아님',
      });
      continue;
    }
    if (seenEdgeIds.has(e.tempId)) continue;
    seenEdgeIds.add(e.tempId);
    edges.push({
      tempId: e.tempId,
      fromTempId: e.fromTempId,
      toTempId: e.toTempId,
      type: e.type,
      ...(typeof e.label === 'string' ? { label: e.label } : {}),
      confidence: e.confidence,
      ...(isStringArray(e.warnings) ? { warnings: e.warnings } : {}),
    });
  }
  const warnings = isStringArray(raw.warnings) ? raw.warnings : [];
  return { ok: true, value: { summary, nodes, edges, warnings }, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// T-4d — Anthropic Claude wrapper (JS mirror)
// ─────────────────────────────────────────────────────────────────────────────

export class LlmCallError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'LlmCallError';
    this.code = code;
    this.cause = cause;
  }
}

function estimateCost(model, inputTokens, outputTokens) {
  const p = MODEL_PRICING[model];
  if (!p) return undefined;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

export async function callClaude({
  apiKey,
  system,
  user,
  model = 'claude-sonnet-4-6',
  maxTokens = 4096,
  // T-11 재현성을 위해 default temperature=0. 같은 doc 재추출 시 결과 분산 최소화.
  temperature = 0,
  timeoutMs = 30_000,
  baseUrl = 'https://api.anthropic.com',
  anthropicVersion = '2023-06-01',
  fetch: fetchImpl = globalThis.fetch,
}) {
  if (!apiKey) throw new LlmCallError('auth', 'apiKey is required');
  const startedAt = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': anthropicVersion,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new LlmCallError('timeout', `LLM call exceeded ${timeoutMs}ms`, err);
    }
    throw new LlmCallError('network', 'fetch failed', err);
  } finally {
    clearTimeout(t);
  }
  const latencyMs = Date.now() - startedAt;
  if (response.status === 401 || response.status === 403) {
    throw new LlmCallError('auth', `auth failed (${response.status})`);
  }
  if (response.status === 429) throw new LlmCallError('rate_limit', 'rate limited');
  if (response.status >= 500) {
    throw new LlmCallError('server_error', `server error ${response.status}`);
  }
  if (!response.ok) {
    throw new LlmCallError('invalid_response', `unexpected status ${response.status}`);
  }
  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw new LlmCallError('invalid_response', 'response not JSON', err);
  }
  if (body.type !== 'message' || !Array.isArray(body.content)) {
    throw new LlmCallError('invalid_response', `unexpected shape (type=${body.type})`);
  }
  const text = body.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const inputTokens = body.usage?.input_tokens ?? 0;
  const outputTokens = body.usage?.output_tokens ?? 0;
  const estimatedCostUsd = estimateCost(body.model, inputTokens, outputTokens);
  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
    },
    latencyMs,
    model: body.model,
    stopReason: body.stop_reason ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator — md → ExtractionOutput
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object} args
 * @param {string} args.markdown
 * @param {Array} args.classes              ontology TBox classes (시드 5)
 * @param {Array} args.relations            ontology TBox relations (시드 7)
 * @param {string} args.apiKey              Anthropic API key
 * @param {string} args.extractorVersion    예: "ontology-v1"
 * @param {string} [args.documentId]        trail 용
 * @param {string} [args.model]
 * @param {Function} [args.callLlmFn]       테스트 시 mock 주입. 기본 callClaude.
 * @returns {Promise<{ output, warnings, grade, usage, latencyMs, validationErrors }>}
 */
export async function extractOntology({
  markdown,
  classes,
  relations,
  apiKey,
  extractorVersion,
  documentId,
  model,
  callLlmFn = callClaude,
}) {
  const parsed = parseOntologyDocument(markdown);
  const prompt = buildExtractionPrompt({
    parsedDoc: parsed,
    classes,
    relations,
    extractorVersion,
    documentId,
  });

  const llm = await callLlmFn({
    apiKey,
    system: prompt.system,
    user: prompt.user,
    model,
  });

  let parsedJson;
  try {
    // LLM 이 markdown fence 를 붙여 보낼 수 있음 — 안전하게 strip.
    const cleaned = llm.text.trim().replace(/^```(?:json)?\s*/, '').replace(/```$/, '').trim();
    parsedJson = JSON.parse(cleaned);
  } catch (err) {
    throw new LlmCallError(
      'invalid_response',
      `LLM 출력을 JSON 으로 파싱 실패: ${err?.message || err}`,
      err,
    );
  }

  const validation = validateExtractionOutput(parsedJson);

  // confidence cap enforce
  const cap = prompt.confidenceCap;
  const cappedNodes = (validation.value?.nodes || []).map((n) => ({
    ...n,
    confidence: Math.min(n.confidence, cap),
  }));
  const cappedEdges = (validation.value?.edges || []).map((e) => ({
    ...e,
    confidence: Math.min(e.confidence, cap),
  }));

  // T-12b — frontmatter.relates 처리:
  //   1. 각 relates.target 이 추출된 노드의 tempId / frontmatter id 와 매칭되면 → 그대로 edge 만 생성
  //   2. 매칭 안 되면 → stub placeholder + 강등된 edge (`related_to`)
  // 모든 relates 는 사용자가 명시한 사실이므로 confidence = 1.0 (cap 무시).
  // 결정 문서: 2026-04-27-ontology-id-resolution.md §2.
  const fmRelates = parsed.frontmatter.relates || [];
  const fmId = parsed.frontmatter.id;
  const stubsBatch = [];
  const fmEdges = [];
  const fmWarnings = [];

  if (fmRelates.length > 0) {
    if (!fmId) {
      fmWarnings.push('frontmatter relates 가 있지만 id 가 없어 edge 의 source 를 결정할 수 없음');
    } else {
      // source canonical = `<frontmatterKind>:<frontmatterId>`
      const sourceKind = parsed.frontmatter.kind || 'document';
      const sourceCanonical = `${sourceKind}:${fmId}`;
      // 추출된 노드들의 tempId 와 frontmatter id 매칭용 set
      const extractedTempIds = new Set(cappedNodes.map((n) => n.tempId));
      for (const rel of fmRelates) {
        const targetMatches = extractedTempIds.has(rel.target);
        if (targetMatches) {
          // 추출된 노드와 매칭 — 정상 edge.
          fmEdges.push({
            tempId: `fm-${fmId}-${rel.target}-${rel.type}`,
            fromTempId: fmId,
            toTempId: rel.target,
            type: rel.type,
            confidence: 1.0,
            warnings: ['frontmatter-declared'],
          });
        } else {
          // stub 생성 + 강등된 edge.
          stubsBatch.push(
            createStubPlaceholder({
              targetId: rel.target,
              declaredType: rel.type,
              pendingFromId: sourceCanonical,
              evidenceDocumentId: documentId || fmId,
            }),
          );
          fmEdges.push({
            tempId: `fm-${fmId}-${rel.target}-stub`,
            fromTempId: fmId,
            toTempId: rel.target, // 검수 단계에서 stub canonical id 로 resolve
            type: 'related_to', // 강등 — 원본 type 은 stub.pendingType 에 보존
            confidence: 1.0,
            warnings: [
              `frontmatter-declared (stub created for unknown target "${rel.target}", original type=${rel.type})`,
            ],
          });
          fmWarnings.push(
            `stub created for unknown target "${rel.target}" — please import or define`,
          );
        }
      }
    }
  }

  const mergedStubs = mergeStubPlaceholders(stubsBatch);

  // canonical conflict 감지 — 추출된 노드들의 canonical id 가 같은 id 다른 kind
  // 로 매핑되면 warning. (frontmatter id 는 노드별로 다 같으므로 보통 자기
  // 충돌은 없지만, primaryProjectId 가 다른 두 같은 title 의 노드는 다른
  // legacy slug 를 받음 → 충돌은 없음. 진짜 충돌 케이스는 cross-document.)
  const canonicalResults = cappedNodes.map((n) => {
    const r = resolveCanonicalNodeId({
      tempId: n.tempId,
      title: n.title,
      kind: n.kind,
      primaryProjectId: n.projectIds?.[0],
      frontmatterId: n.tempId === fmId ? fmId : undefined,
      frontmatterKind: n.tempId === fmId ? parsed.frontmatter.kind : undefined,
    });
    return { ...r, sourceTempId: n.tempId };
  });
  // 같은 batch 안에서 충돌이 있으면 surface (대부분 cross-document 라 잘 안 잡힘)
  const conflictWarnings = canonicalResults
    .filter((r) => r.conflictWarning)
    .map((r) => `${r.sourceTempId}: ${r.conflictWarning}`);

  const allWarnings = [
    ...parsed.warnings,
    ...(validation.value?.warnings || []),
    ...(validation.errors.length > 0
      ? [`validator dropped ${validation.errors.length} item(s)`]
      : []),
    ...fmWarnings,
    ...conflictWarnings,
  ];

  return {
    output: {
      summary: validation.value?.summary || '',
      nodes: cappedNodes,
      edges: [...cappedEdges, ...fmEdges],
      warnings: allWarnings,
      // 별도 필드 — 워커가 batch write 시 stubs 도 knowledgeApprovedNodes 에 set.
      stubs: mergedStubs,
      // canonical 매핑 결과 — approval flow 가 직접 사용 가능 (legacy buildCanonicalNodeId 우회).
      canonicalIds: canonicalResults,
    },
    grade: parsed.grade,
    usage: llm.usage,
    latencyMs: llm.latencyMs,
    validationErrors: validation.errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed TBox — `src/entities/ontology-class/model/defaults.ts` 와
// `src/entities/ontology-relation/model/defaults.ts` 의 내용 mirror.
// 운영에서는 ontologyClasses / ontologyRelations 컬렉션을 fetch 해 사용해야
// 하지만, 시드 부재 / fetch 실패 시 fallback 으로 사용.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_ONTOLOGY_CLASSES = [
  { id: 'project', name: '프로젝트', description: '외부에 드러나는 제품·시스템·이니셔티브 단위.' },
  { id: 'domain', name: '도메인', description: '프로젝트 안의 큰 문제 영역 또는 운영 영역.' },
  { id: 'capability', name: '역량', description: '도메인이 제공하는 기능적 능력.' },
  { id: 'element', name: '요소', description: '실제 구현체·자산·인터페이스·데이터 구조.' },
  { id: 'document', name: '문서', description: '근거 노드. describes 관계로 개념과 연결.' },
  // T-12: stub placeholder kind (id-resolution.md §2)
  { id: 'unknown', name: '미지', description: '미존재 relates.target 의 placeholder. 검수자가 promote/dismiss.' },
];

export const DEFAULT_ONTOLOGY_RELATIONS = [
  {
    id: 'contains',
    name: '포함',
    description: '상위 구조가 하위 구조를 품음.',
    sourceClassIds: ['project', 'domain', 'capability'],
    targetClassIds: ['domain', 'capability', 'element'],
    category: 'structure',
    symmetric: false,
    transitive: true,
  },
  {
    id: 'belongs_to',
    name: '소속',
    description: '하위가 상위에 속함.',
    sourceClassIds: ['domain', 'capability', 'element'],
    targetClassIds: ['project', 'domain', 'capability'],
    category: 'structure',
    symmetric: false,
    transitive: true,
  },
  {
    id: 'depends_on',
    name: '의존',
    description: '동작 관계.',
    sourceClassIds: ['project', 'capability', 'element'],
    targetClassIds: ['project', 'capability', 'element'],
    category: 'behavior',
    symmetric: false,
    transitive: false,
  },
  {
    id: 'implements',
    name: '구현',
    description: '요소가 역량을 구현.',
    sourceClassIds: ['element'],
    targetClassIds: ['capability'],
    category: 'behavior',
    symmetric: false,
    transitive: false,
  },
  {
    id: 'uses',
    name: '사용',
    description: '한 요소가 다른 요소를 사용.',
    sourceClassIds: ['element', 'capability'],
    targetClassIds: ['element'],
    category: 'behavior',
    symmetric: false,
    transitive: false,
  },
  {
    id: 'describes',
    name: '설명',
    description: '문서가 개념을 설명. 근거 관계.',
    sourceClassIds: ['document'],
    targetClassIds: ['project', 'domain', 'capability', 'element'],
    category: 'evidence',
    symmetric: false,
    transitive: false,
  },
  {
    id: 'related_to',
    name: '연관',
    description: '약 연관.',
    sourceClassIds: [],
    targetClassIds: [],
    category: 'weak',
    symmetric: true,
    transitive: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// T-12 canonical mapping + stub placeholder mirror
// canonical 함수들의 TS canonical 은 src/shared/lib/ontology-canonicalize/.
// 변경 시 두 곳을 같이 갱신.
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeSlug(input) {
  return (
    String(input || '')
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

/**
 * canonical node ID 결정. 결정 문서: 2026-04-27-ontology-id-resolution.md §1.
 *
 * @param {{ tempId: string, title: string, kind: string, primaryProjectId?: string,
 *   frontmatterId?: string, frontmatterKind?: string }} input
 * @returns {{ canonicalId: string, resolvedKind: string,
 *   source: 'frontmatter-id' | 'legacy-slug', conflictWarning?: string }}
 */
export function resolveCanonicalNodeId(input) {
  const { kind, title, primaryProjectId, frontmatterId, frontmatterKind } = input;

  if (frontmatterId) {
    if (frontmatterKind) {
      const conflictWarning =
        frontmatterKind !== kind
          ? `frontmatter kind="${frontmatterKind}" 가 추출 kind="${kind}" 와 충돌 — frontmatter 우선 적용 (검수 시 확인 필요)`
          : undefined;
      const result = {
        canonicalId: `${frontmatterKind}:${frontmatterId}`,
        resolvedKind: frontmatterKind,
        source: 'frontmatter-id',
      };
      if (conflictWarning) result.conflictWarning = conflictWarning;
      return result;
    }
    return {
      canonicalId: `${kind}:${frontmatterId}`,
      resolvedKind: kind,
      source: 'frontmatter-id',
    };
  }

  const scopeSlug = primaryProjectId ? normalizeSlug(primaryProjectId) : 'global';
  const titleSlug = normalizeSlug(title);
  return {
    canonicalId: `${kind}:${scopeSlug}:${titleSlug}`,
    resolvedKind: kind,
    source: 'legacy-slug',
  };
}

export function createStubPlaceholder({ targetId, declaredType, pendingFromId, evidenceDocumentId }) {
  const normalizedTarget = normalizeSlug(targetId);
  return {
    id: `unknown:${normalizedTarget}`,
    title: targetId,
    kind: 'unknown',
    projectIds: [],
    evidenceIds: [evidenceDocumentId],
    isStub: true,
    pendingType: declaredType,
    pendingFromId,
  };
}

export function mergeStubPlaceholders(stubs) {
  const byId = new Map();
  for (const stub of stubs) {
    const existing = byId.get(stub.id);
    if (existing) {
      const merged = new Set([...existing.evidenceIds, ...stub.evidenceIds]);
      byId.set(stub.id, { ...existing, evidenceIds: [...merged] });
    } else {
      byId.set(stub.id, stub);
    }
  }
  return [...byId.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Output record builder — extractOntology 결과를
// `knowledgeExtractionOutputs` 컬렉션 shape 으로 변환 (DATA-MODEL §4 정합).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object} args
 * @param {string|null} [args.accountId]
 * @param {string} args.jobId
 * @param {string} args.documentId
 * @param {string} args.documentVersionId
 * @param {string} args.extractorVersion
 * @param {Object} args.extraction       extractOntology 결과
 * @param {*} args.serverTimestamp        FieldValue.serverTimestamp() — 호출자가 주입.
 * @returns {Object} Firestore doc payload
 */
export function buildOntologyOutputRecord({
  accountId,
  jobId,
  documentId,
  documentVersionId,
  extractorVersion,
  extraction,
  serverTimestamp,
}) {
  return {
    ...(accountId ? { accountId } : {}),
    jobId,
    documentId,
    documentVersionId,
    extractorVersion,
    provider: 'anthropic',
    summary: extraction.output.summary,
    nodes: extraction.output.nodes,
    edges: extraction.output.edges,
    warnings: extraction.output.warnings,
    grade: extraction.grade,
    usage: extraction.usage,
    latencyMs: extraction.latencyMs,
    validationErrorCount: (extraction.validationErrors || []).length,
    createdAt: serverTimestamp,
  };
}

// 단순 logger wrapper — functions/ 환경에서 호출 시 firebase logger, 그 외 console.
// firebase-functions 가 deps 에 없는 테스트 환경에서도 작동하도록 dynamic import.
export async function logExtraction(metadata) {
  try {
    const mod = await import('firebase-functions/v2');
    mod.logger.info('[ontology-extract]', metadata);
  } catch {
    console.log('[ontology-extract]', metadata);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A0-3 — markdown chunk 분해 + 결과 merge.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * markdown 을 maxLen 이하 chunk 로 분할. 자연 경계 (heading / 빈 줄 paragraph)
 * 를 우선해 의미 단위 보존. 한 chunk 가 maxLen 을 초과하지 않도록 보장.
 *
 * 알고리즘:
 *   1. md.length ≤ maxLen 이면 [md] 반환 (early exit).
 *   2. cursor 부터 maxLen 만큼 windowed slice.
 *   3. window 안에서 가장 마지막 heading (`# `, `## ` 등 line-start) 위치 찾음.
 *      찾으면 그 위치 (line 시작) 에서 끊음.
 *   4. heading 없으면 가장 마지막 빈 줄 (`\n\n`) — maxLen*0.5 이상이면 채택.
 *   5. 둘 다 없으면 maxLen 위치 hard cut (forward progress 보장).
 *
 * @param {string} md
 * @param {number} maxLen
 * @returns {string[]}
 */
export function splitMarkdownByLength(md, maxLen) {
  if (typeof md !== 'string' || md.length === 0) return [''];
  if (md.length <= maxLen) return [md];
  if (maxLen <= 0) throw new Error('maxLen must be > 0');

  const chunks = [];
  let cursor = 0;
  while (cursor < md.length) {
    const remaining = md.length - cursor;
    if (remaining <= maxLen) {
      chunks.push(md.slice(cursor));
      break;
    }
    const window = md.slice(cursor, cursor + maxLen);
    let splitOffset = -1;
    // heading boundary — `^#{1,6} ` line start.
    const headingRegex = /(^|\n)(#{1,6} )/g;
    let lastHeadingMatch = -1;
    let m;
    while ((m = headingRegex.exec(window)) !== null) {
      // m.index 는 매칭 시작 (이전 \n 또는 0). heading line 시작은 \n 다음.
      const lineStart = m[1] === '\n' ? m.index + 1 : m.index;
      if (lineStart > 0) lastHeadingMatch = lineStart;
    }
    if (lastHeadingMatch > 0) {
      splitOffset = lastHeadingMatch;
    } else {
      // paragraph boundary — last \n\n in window, 절반 이상 진행했을 때만.
      const paraIdx = window.lastIndexOf('\n\n');
      if (paraIdx > maxLen * 0.5) splitOffset = paraIdx + 2;
    }
    if (splitOffset <= 0) splitOffset = maxLen; // hard cut.
    chunks.push(md.slice(cursor, cursor + splitOffset));
    cursor += splitOffset;
  }
  return chunks;
}

/**
 * 여러 chunk extract 결과를 한 output 으로 merge.
 *
 * - 노드 dedup: (kind, normalize(title)) 키. 첫 entry 보존, 같은 키 중복 시
 *   confidence 가 더 높으면 갱신. tempId 는 chunk-prefix 로 충돌 회피.
 * - 엣지 dedup: 노드 dedup 결과의 새 tempId 로 from/to 매핑 후 (type, from,
 *   to) 키. 같은 트리플 중복 시 confidence 가 더 높으면 갱신.
 * - usage / latency: 단순 합산.
 * - grade: 가장 보수적 (worst) 등급 — 한 chunk 라도 C 면 전체 C.
 *
 * @param {Array<{output:{nodes:any[],edges:any[]}, grade?:string, usage?:any, latencyMs?:number}>} results
 * @returns merged extraction object (extractOntology 와 같은 shape + chunkCount).
 */
export function mergeOntologyExtractions(results) {
  const nodeMap = new Map();
  const edgeMap = new Map();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let totalLatency = 0;
  let chunkLevelGrade = null;
  const allWarnings = [];
  const canonicalIdsAll = [];

  const gradeOrder = { A: 0, B: 1, C: 2 };
  const normalizeTitle = (t) => String(t ?? '').trim().toLowerCase();

  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    if (!r || !r.output) continue;
    const tempIdToKey = new Map();

    for (const node of r.output.nodes ?? []) {
      const key = `${(node.kind || '').toLowerCase()}::${normalizeTitle(node.title)}`;
      tempIdToKey.set(node.tempId, key);
      const existing = nodeMap.get(key);
      const newTempId = existing ? existing.tempId : `c${i}-${node.tempId}`;
      if (!existing) {
        nodeMap.set(key, { ...node, tempId: newTempId });
      } else if ((node.confidence ?? 0) > (existing.confidence ?? 0)) {
        nodeMap.set(key, { ...existing, ...node, tempId: newTempId, confidence: node.confidence });
      }
    }

    for (const edge of r.output.edges ?? []) {
      const fromKey = tempIdToKey.get(edge.fromTempId);
      const toKey = tempIdToKey.get(edge.toTempId);
      if (!fromKey || !toKey) continue;
      const fromNode = nodeMap.get(fromKey);
      const toNode = nodeMap.get(toKey);
      if (!fromNode || !toNode) continue;
      const ek = `${edge.type}::${fromNode.tempId}::${toNode.tempId}`;
      const existing = edgeMap.get(ek);
      if (!existing) {
        edgeMap.set(ek, {
          ...edge,
          tempId: `c${i}-${edge.tempId}`,
          fromTempId: fromNode.tempId,
          toTempId: toNode.tempId,
        });
      } else if ((edge.confidence ?? 0) > (existing.confidence ?? 0)) {
        edgeMap.set(ek, { ...existing, confidence: edge.confidence });
      }
    }

    if (r.usage) {
      totalInputTokens += r.usage.inputTokens || 0;
      totalOutputTokens += r.usage.outputTokens || 0;
      totalCost += r.usage.estimatedCostUsd || 0;
    }
    if (typeof r.latencyMs === 'number') totalLatency += r.latencyMs;
    if (r.grade) {
      if (!chunkLevelGrade || gradeOrder[r.grade] > gradeOrder[chunkLevelGrade]) {
        chunkLevelGrade = r.grade;
      }
    }
    if (Array.isArray(r.warnings)) allWarnings.push(...r.warnings);
    if (Array.isArray(r.canonicalIds)) canonicalIdsAll.push(...r.canonicalIds);
  }

  return {
    output: { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] },
    grade: chunkLevelGrade,
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      estimatedCostUsd: totalCost,
    },
    latencyMs: totalLatency,
    warnings: allWarnings,
    canonicalIds: canonicalIdsAll,
    chunkCount: results.length,
  };
}

/**
 * markdown 이 chunk hard cap 을 넘으면 자동 분할 후 chunk 별 extractOntology
 * 호출, 결과 merge. 이내면 단일 호출 (extractOntology 와 동일).
 *
 * @param {Object} args                — extractOntology 와 같은 args + maxChunkSize.
 * @param {number} [args.maxChunkSize] — 한 chunk 의 char 한도 (기본 60_000).
 * @param {number} [args.maxChunks]    — 최대 chunk 수 (기본 5). 초과 시 throw.
 */
export async function extractOntologyChunked({
  markdown,
  classes,
  relations,
  apiKey,
  extractorVersion,
  documentId,
  model,
  callLlmFn = callClaude,
  maxChunkSize = 60_000,
  maxChunks = 5,
}) {
  const chunks = splitMarkdownByLength(markdown ?? '', maxChunkSize);
  if (chunks.length > maxChunks) {
    throw new Error(
      `[cost_cap] markdown 이 너무 커서 ${chunks.length} chunk 로 분할됨 (한도 ${maxChunks}). 더 작은 단위로 사전 분해 필요.`,
    );
  }
  if (chunks.length === 1) {
    return extractOntology({
      markdown: chunks[0],
      classes,
      relations,
      apiKey,
      extractorVersion,
      documentId,
      model,
      callLlmFn,
    });
  }
  const results = [];
  for (let i = 0; i < chunks.length; i += 1) {
    // documentId 에 chunk index 살짝 — LLM 이 같은 doc 의 partial 임을 힌트.
    const r = await extractOntology({
      markdown: chunks[i],
      classes,
      relations,
      apiKey,
      extractorVersion,
      documentId: `${documentId}#chunk-${i}`,
      model,
      callLlmFn,
    });
    results.push(r);
  }
  return mergeOntologyExtractions(results);
}
