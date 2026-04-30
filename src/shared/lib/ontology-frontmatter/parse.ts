/**
 * Ontology md 파서 — `2026-04-27-ontology-frontmatter-contract.md` 구현.
 *
 * `parseOntologyDocument(md)` →
 *   { frontmatter: typed, body, grade: A|B|C, warnings: string[] }
 *
 * 기본 key:value / 인라인 배열은 `parse-frontmatter.ts` 의 lightweight parser 가
 * 처리하지만, ontology 계약은 nested `relates:` 블록을 추가로 인식해야 한다.
 * 본 모듈은 그 위에 ontology-aware 레이어를 얹는다.
 *
 * YAML 라이브러리 추가 없이 **계약 shape 에 한정** 한 손글씨 파서. shape 가
 * 더 복잡해지면 js-yaml 도입 검토.
 */

import {
  type OntologyDocumentGrade,
  type OntologyDocumentStatus,
  type OntologyEdgeType,
  type OntologyElementTypeId,
  type OntologyFrontmatter,
  type OntologyFrontmatterRelation,
  type OntologyKind,
  type ParsedOntologyDocument,
} from './types';

const KIND_VALUES: ReadonlyArray<OntologyKind> = [
  'project',
  'domain',
  'capability',
  'element',
  'document',
];

const STATUS_VALUES: ReadonlyArray<OntologyDocumentStatus> = [
  'draft',
  'active',
  'deprecated',
  'archived',
];

const ELEMENT_TYPE_VALUES: ReadonlyArray<OntologyElementTypeId> = [
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

const EDGE_TYPE_VALUES: ReadonlyArray<OntologyEdgeType> = [
  'contains',
  'belongs_to',
  'depends_on',
  'implements',
  'uses',
  'describes',
  'related_to',
];

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const REQUIRED_KEYS = ['id', 'kind', 'project', 'title', 'version'] as const;
const RECOMMENDED_KEYS = ['domain', 'status', 'aliases', 'tags'] as const;

interface RawBlock {
  rawFrontmatter: string;
  body: string;
}

/** `---\n...\n---\n` 블록 분리. 없으면 frontmatter X. */
function splitFrontmatterBlock(md: string): RawBlock | null {
  if (!md.startsWith('---')) return null;
  const end = md.indexOf('\n---', 3);
  if (end === -1) return null;
  const rawFrontmatter = md.slice(4, end).trim();
  // 닫는 `---` 뒤의 모든 leading newline 제거 (frontmatter 와 body 사이 빈 줄
  // 개수에 무관하게 body 가 첫 컨텐츠로 시작).
  const body = md.slice(end + 4).replace(/^[\r\n]+/, '');
  return { rawFrontmatter, body };
}

/** 인라인 배열 `[a, b, "c"]` 파싱. 따옴표 제거. */
function parseInlineArray(value: string): string[] {
  return value
    .slice(1, -1)
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '');
}

interface FrontmatterFlat {
  scalars: Record<string, string>;
  arrays: Record<string, string[]>;
  relates: OntologyFrontmatterRelation[];
  warnings: string[];
}

/**
 * frontmatter raw 문자열을 분리 — top-level scalar / inline array / relates 블록.
 * relates 는 `relates:` 다음 줄부터 indent (`  -`) 가 사라질 때까지가 블록.
 */
function flattenFrontmatter(raw: string): FrontmatterFlat {
  const scalars: Record<string, string> = {};
  const arrays: Record<string, string[]> = {};
  const relates: OntologyFrontmatterRelation[] = [];
  const warnings: string[] = [];

  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
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
      // block-style — 다음 줄들을 indent 로 본다.
      if (key === 'relates') {
        i++;
        const consumed = parseRelatesBlock(lines, i, relates, warnings);
        i += consumed;
      } else if (key === 'aliases' || key === 'tags') {
        i++;
        const items: string[] = [];
        while (i < lines.length) {
          const next = lines[i]!;
          if (!next.match(/^\s+-\s+/)) break;
          const item = next.replace(/^\s+-\s+/, '').trim();
          if (item) items.push(unquote(item));
          i++;
        }
        arrays[key] = items;
      } else {
        // 알 수 없는 빈 값 — 그냥 skip.
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

  return { scalars, arrays, relates, warnings };
}

/**
 * `relates:` 블록 파싱.
 *   relates:
 *     - type: depends_on
 *       target: iam
 *       note: "..."
 *     - type: ...
 *       target: ...
 *
 * 반환값 = 소비한 줄 수.
 */
function parseRelatesBlock(
  lines: string[],
  startIdx: number,
  out: OntologyFrontmatterRelation[],
  warnings: string[],
): number {
  let i = startIdx;
  let consumed = 0;
  let current: Partial<OntologyFrontmatterRelation> | null = null;

  const flush = () => {
    if (!current) return;
    if (!current.type || !current.target) {
      warnings.push(`relates: 항목 누락 (type 또는 target). 무시됨.`);
    } else if (!(EDGE_TYPE_VALUES as readonly string[]).includes(current.type)) {
      warnings.push(`relates: 알 수 없는 edge type "${current.type}". 무시됨.`);
    } else {
      out.push(current as OntologyFrontmatterRelation);
    }
    current = null;
  };

  while (i < lines.length) {
    const line = lines[i]!;
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
          assignRelationField(current, k, v);
        }
      }
    } else if (current) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const k = trimmed.slice(0, colonIdx).trim();
        const v = unquote(trimmed.slice(colonIdx + 1).trim());
        assignRelationField(current, k, v);
      }
    }
    i++;
    consumed++;
  }
  flush();
  return consumed;
}

function assignRelationField(
  rel: Partial<OntologyFrontmatterRelation>,
  key: string,
  value: string,
): void {
  if (key === 'type') {
    rel.type = value as OntologyEdgeType;
  } else if (key === 'target') {
    rel.target = value;
  } else if (key === 'note') {
    rel.note = value;
  }
}

/** scalars + arrays + relates → typed frontmatter + 검증 warnings. */
function buildTypedFrontmatter(
  flat: FrontmatterFlat,
): { fm: Partial<OntologyFrontmatter>; warnings: string[] } {
  const fm: Partial<OntologyFrontmatter> = {};
  const warnings: string[] = [...flat.warnings];

  if (flat.scalars.id) {
    if (!ID_PATTERN.test(flat.scalars.id)) {
      warnings.push(`id "${flat.scalars.id}" 가 kebab-case 패턴에 맞지 않음.`);
    }
    fm.id = flat.scalars.id;
  }
  if (flat.scalars.kind) {
    if ((KIND_VALUES as readonly string[]).includes(flat.scalars.kind)) {
      fm.kind = flat.scalars.kind as OntologyKind;
    } else {
      warnings.push(`kind "${flat.scalars.kind}" 가 합법값이 아님 (project/domain/capability/element/document).`);
    }
  }
  if (flat.scalars.project) fm.project = flat.scalars.project;
  if (flat.scalars.title) fm.title = flat.scalars.title;
  if (flat.scalars.version !== undefined) {
    const v = Number(flat.scalars.version);
    if (Number.isFinite(v) && v >= 1) fm.version = v;
    else warnings.push(`version "${flat.scalars.version}" 가 유효한 정수가 아님.`);
  }
  if (flat.scalars.domain) fm.domain = flat.scalars.domain;
  if (flat.scalars.status) {
    if ((STATUS_VALUES as readonly string[]).includes(flat.scalars.status)) {
      fm.status = flat.scalars.status as OntologyDocumentStatus;
    } else {
      warnings.push(`status "${flat.scalars.status}" 가 합법값이 아님.`);
    }
  }
  if (flat.scalars.elementType) {
    if ((ELEMENT_TYPE_VALUES as readonly string[]).includes(flat.scalars.elementType)) {
      fm.elementType = flat.scalars.elementType as OntologyElementTypeId;
    } else {
      warnings.push(`elementType "${flat.scalars.elementType}" 가 9 종 enum 에 없음.`);
    }
  }
  if (flat.arrays.aliases) fm.aliases = flat.arrays.aliases;
  if (flat.arrays.tags) fm.tags = flat.arrays.tags;
  if (flat.relates.length > 0) fm.relates = flat.relates;

  // relates target 이 자기 자신인 경우 경고.
  if (fm.id && fm.relates) {
    for (const rel of fm.relates) {
      if (rel.target === fm.id) {
        warnings.push(`relates.target "${rel.target}" 가 자기 자신을 가리킴.`);
      }
    }
  }

  return { fm, warnings };
}

/** 등급 산정 — 필수 / 권장 / elementType (kind=element 만) 평가. */
function computeGrade(fm: Partial<OntologyFrontmatter>): OntologyDocumentGrade {
  const requiredOk = REQUIRED_KEYS.every((k) => fm[k] !== undefined && fm[k] !== '');
  if (!requiredOk) return 'C';

  const recommendedOk = RECOMMENDED_KEYS.every((k) => {
    const v = fm[k];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== '';
  });
  // element 인 경우 elementType 도 등급 A 조건.
  const elementOk = fm.kind === 'element' ? !!fm.elementType : true;
  return recommendedOk && elementOk ? 'A' : 'B';
}

/** 메인 진입점. */
export function parseOntologyDocument(md: string): ParsedOntologyDocument {
  const split = splitFrontmatterBlock(md);
  if (!split) {
    return {
      frontmatter: {},
      body: md,
      grade: 'C',
      warnings: ['frontmatter 블록이 없음. 등급 C (자동 반영 금지) 적용.'],
    };
  }
  const flat = flattenFrontmatter(split.rawFrontmatter);
  const { fm, warnings } = buildTypedFrontmatter(flat);
  const grade = computeGrade(fm);
  if (grade === 'C') {
    warnings.push('필수 frontmatter 누락. 등급 C (자동 반영 금지) 적용.');
  }
  return {
    frontmatter: fm,
    body: split.body,
    grade,
    warnings,
  };
}
