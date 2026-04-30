/**
 * Schema-guided extraction prompt builder.
 *
 * 입력:
 *   - parsedDoc: T-4a 가 만든 ParsedOntologyDocument (frontmatter + body + grade)
 *   - classes: ontologyClasses 시드 / 현재 TBox
 *   - relations: ontologyRelations 시드 / 현재 TBox
 *   - extractorVersion: 추출기 버전 라벨 (warning trail)
 *
 * 출력: { system, user } — Anthropic Claude / OpenAI 모두 호환되는
 * 메시지 한 쌍. system 은 schema + 정책, user 는 실제 문서.
 *
 * 신뢰도 정책 (T-7):
 *   - 등급 A 문서: confidence ≤ 1.0 자유롭게
 *   - 등급 B 문서: confidence ≤ 0.84 (medium 상한)
 *   - 등급 C 문서: confidence ≤ 0.59 (low 상한, 자동 반영 금지 강제)
 */

import type { OntologyClass } from '@/entities/ontology-class';
import type { OntologyRelation } from '@/entities/ontology-relation';
import type { ParsedOntologyDocument } from '@/shared/lib/ontology-frontmatter';

export interface BuildPromptInput {
  parsedDoc: ParsedOntologyDocument;
  classes: OntologyClass[];
  relations: OntologyRelation[];
  extractorVersion: string;
  /** 문서 식별자 — output warnings 에 trail. */
  documentId?: string;
}

export interface BuildPromptResult {
  system: string;
  user: string;
  /** 등급에 따른 confidence 상한. 워커는 이를 후처리에서 다시 enforce. */
  confidenceCap: number;
}

const CONFIDENCE_CAP_BY_GRADE = {
  A: 1.0,
  B: 0.84,
  C: 0.59,
} as const;

function formatClasses(classes: OntologyClass[]): string {
  return classes
    .map((c) => {
      const parent = c.parentClassId ? ` (extends ${c.parentClassId})` : '';
      const desc = c.description ? `: ${c.description}` : '';
      return `- \`${c.id}\`${parent}${desc}`;
    })
    .join('\n');
}

function formatRelations(relations: OntologyRelation[]): string {
  return relations
    .map((r) => {
      const src = r.sourceClassIds.length === 0 ? '*' : r.sourceClassIds.join('|');
      const tgt = r.targetClassIds.length === 0 ? '*' : r.targetClassIds.join('|');
      const props = [
        r.symmetric ? 'symmetric' : null,
        r.transitive ? 'transitive' : null,
      ]
        .filter(Boolean)
        .join(', ');
      const propsStr = props ? ` [${props}]` : '';
      return `- \`${r.id}\` (${r.category}): ${src} → ${tgt}${propsStr}${
        r.description ? ` — ${r.description}` : ''
      }`;
    })
    .join('\n');
}

function formatFrontmatterFacts(parsedDoc: ParsedOntologyDocument): string {
  const fm = parsedDoc.frontmatter;
  const lines: string[] = [];
  if (fm.id) lines.push(`- this document declares id = \`${fm.id}\``);
  if (fm.kind) lines.push(`- declared kind = \`${fm.kind}\``);
  if (fm.project) lines.push(`- declared project = \`${fm.project}\``);
  if (fm.title) lines.push(`- declared title = "${fm.title}"`);
  if (fm.domain) lines.push(`- declared domain = \`${fm.domain}\``);
  if (fm.elementType) lines.push(`- declared elementType = \`${fm.elementType}\``);
  if (fm.aliases && fm.aliases.length > 0) {
    lines.push(`- aliases = [${fm.aliases.map((a) => `"${a}"`).join(', ')}]`);
  }
  if (fm.relates && fm.relates.length > 0) {
    lines.push(`- declared relations (treat as confidence 1.0):`);
    for (const rel of fm.relates) {
      lines.push(`  - ${fm.id ?? '(self)'} \`${rel.type}\` ${rel.target}`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : '(no declared frontmatter)';
}

export function buildExtractionPrompt(input: BuildPromptInput): BuildPromptResult {
  const { parsedDoc, classes, relations, extractorVersion, documentId } = input;
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
    'Return a single JSON object with these top-level keys:',
    '',
    '```',
    '{',
    '  "summary": string,                  // 2~4 sentences in Korean if doc is Korean',
    '  "nodes": Array<{',
    '    "tempId": string,                 // unique within this output, kebab-case',
    '    "title": string,',
    '    "kind": "project"|"domain"|"capability"|"element"|"document",',
    '    "projectIds": string[],           // canonical project IDs the node ties to',
    '    "summary": string,',
    '    "confidence": number,             // 0~1, see policy below',
    '    "elementType"?: "service"|"api"|"agent"|"workflow"|"schema"|"data-store"|"ui"|"prompt"|"integration",',
    '    "warnings"?: string[],',
    '    "evidence"?: Array<{ "excerpt": string, "charStart"?: number, "charEnd"?: number }>',
    '  }>,',
    '  "edges": Array<{',
    '    "tempId": string,',
    '    "fromTempId": string,             // must match a node tempId in this output',
    '    "toTempId": string,',
    '    "type": "contains"|"belongs_to"|"depends_on"|"implements"|"uses"|"describes"|"related_to",',
    '    "label"?: string,',
    '    "confidence": number,',
    '    "warnings"?: string[],',
    '    "evidence"?: Array<{ "excerpt": string, "charStart"?: number, "charEnd"?: number }>',
    '  }>,',
    '  "warnings": string[]                // top-level concerns about the document',
    '}',
    '```',
    '',
    '## Confidence policy',
    '',
    `- This document was classified as **grade ${parsedDoc.grade}**.`,
    `- Maximum allowed confidence for any node/edge: **${cap}**.`,
    '- ≥ 0.85: explicit, structurally clear in the document.',
    '- 0.60 ~ 0.84: contextually likely but not explicit.',
    '- < 0.60: weak signal, mark as `related_to` if relation, send to review.',
    '',
    '## Constraints',
    '',
    '1. Every node/edge **must** include `evidence[]` with at least one excerpt',
    '   from the document body, unless confidence < 0.60. Excerpts ≤ 240 chars.',
    '2. Edge `type` must respect source/target class constraints listed above.',
    '   If unsure, downgrade to `related_to` with confidence ≤ 0.59.',
    '3. Do NOT invent project IDs — only use IDs visible in the frontmatter or body.',
    '4. Self-loop edges (from == to) are forbidden.',
    '5. Output **JSON only** — no prose, no markdown fences.',
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
