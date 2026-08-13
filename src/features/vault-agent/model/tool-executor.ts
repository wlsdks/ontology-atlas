import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { resolveNodeAgentTarget } from '@/entities/knowledge-graph';

import {
  GRAPH_FRONTMATTER_KEYS,
  packConceptEvidence,
  wrapUntrusted,
  type ConceptEvidenceInput,
} from './concept-evidence-pack';
import { findAgentTool } from './tool-catalog';
import type { NormalizedToolCall } from './provider-adapter';
import { AGENT_TOOL_RESULT_CHAR_CAP } from './types';
import type { VaultReadDoc, VaultReadPort } from './vault-read-port';
import {
  containsCompetencyQualification,
  SOURCE_BACKED_COMPETENCY_MESSAGE,
} from './competency-qualification-boundary';

export { GRAPH_FRONTMATTER_KEYS, wrapUntrusted } from './concept-evidence-pack';

/**
 * 정규화된 도구 호출 → 실제 실행.
 *
 * ## 이 파일의 단 하나의 불변식
 *
 * **모델의 write 호출은 디스크에 닿지 않는다.** 실행기는 `VaultReadPort` 만
 * 주입받고(그 타입에는 쓰기 메서드가 없다), write 도구는 실행하지 않고
 * `blocked-write` 로 돌려준다. 제안 카드로의 변환은 호출자(루프)의 일이고,
 * 실제 쓰기는 동의 카드 핸들러가 부르는 별도 모듈의 일이다.
 *
 * 이 구조가 규율이 아니라 코드 경로다 — 실수로 쓰기를 부르려 해도 부를 함수가
 * 여기 없다.
 *
 * ## 결과는 왜 잘리는가
 *
 * 도구 결과는 다음 왕복에 그대로 실려 나간다 — `list_concepts` 가 통째로
 * 실리면 사용자 비용(BYOK 요금)이 조용히 커진다. 상한을 넘으면 잘라내고
 * 모델에게 "좁혀서 다시 물어보라" 고 알린다.
 */

export interface ToolExecution {
  /** 다음 왕복에 실릴 결과 문자열. */
  content: string;
  isError: boolean;
  outcome: 'ok' | 'error' | 'blocked-write' | 'unknown-tool' | 'args-invalid';
  /** 화면 행이 말할 대상 (노드 slug 등). */
  target: string;
  /** 화면 행 한 줄 (평문). */
  summary: string;
  /** 이 호출이 실제로 읽은 노드 slug 들 — 인용 검증·경고 행의 근거. */
  readSlugs: string[];
  /** 이 결과에 실린 볼트 발췌 글자수 (실측). */
  vaultChars: number;
  /** write 도구였다면 그 호출 원문 — 호출자가 제안으로 바꾼다. */
  writeIntent?: { name: string; args: unknown };
}

type Args = Record<string, unknown>;

function asArgs(value: unknown): Args {
  return value && typeof value === 'object' ? (value as Args) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function lastSegment(slug: string): string {
  const index = slug.lastIndexOf('/');
  return index < 0 ? slug : slug.slice(index + 1);
}

/**
 * 결과를 JSON 으로 접고, 상한을 넘으면 정직하게 줄인다.
 *
 * **잘라도 유효한 JSON 이어야 한다.** 문자열을 가위로 자르면 모델이 받는 것은
 * 깨진 JSON 이고, 그때 모델이 하는 일은 추측이다 — 좁혀 물으라는 안내가
 * 도착하지도 않는다. 그래서 배열 필드의 행 수를 줄여 다시 접는다.
 */
function pack(payload: unknown): { content: string; truncated: boolean } {
  const raw = JSON.stringify(payload);
  if (raw.length <= AGENT_TOOL_RESULT_CHAR_CAP) return { content: raw, truncated: false };

  const record = payload as Record<string, unknown>;
  const arrayKey = Object.keys(record ?? {}).find((key) => Array.isArray(record[key]));
  if (arrayKey) {
    const rows = record[arrayKey] as unknown[];
    let keep = rows.length;
    let shrunk = raw;
    while (keep > 0 && shrunk.length > AGENT_TOOL_RESULT_CHAR_CAP) {
      keep = Math.floor(keep / 2);
      shrunk = JSON.stringify({
        ...record,
        [arrayKey]: rows.slice(0, keep),
        truncated: true,
        omitted: rows.length - keep,
        hint: 'The result was larger than the per-round cap, so rows were dropped. Narrow the query — add a kind/domain filter or a smaller limit — and ask again.',
      });
    }
    return { content: shrunk, truncated: true };
  }
  return {
    content: JSON.stringify({
      truncated: true,
      hint: 'The result was larger than the per-round cap. Ask for a narrower slice of it.',
      preview: raw.slice(0, AGENT_TOOL_RESULT_CHAR_CAP / 2),
    }),
    truncated: true,
  };
}

/** slug 별칭 → 노드. 문서 slug · 마지막 조각 · 파생 노드의 원문 참조를 받는다. */
function buildResolver(port: VaultReadPort) {
  const index = new Map<string, KnowledgeGraphNode>();
  const add = (key: string | null | undefined, node: KnowledgeGraphNode) => {
    const trimmed = key?.trim();
    if (!trimmed) return;
    if (!index.has(trimmed)) index.set(trimmed, node);
  };
  for (const node of port.nodes) {
    const target = resolveNodeAgentTarget(node);
    add(target.ref, node);
    if (target.ref) add(lastSegment(target.ref), node);
    add(node.id, node);
    add(node.title, node);
  }
  return (input: string): KnowledgeGraphNode | null => {
    const trimmed = input.trim().replace(/\.md$/, '');
    return index.get(trimmed) ?? index.get(lastSegment(trimmed)) ?? null;
  };
}

function frontmatterRefs(doc: VaultReadDoc): Array<{ key: string; ref: string }> {
  const refs: Array<{ key: string; ref: string }> = [];
  for (const key of GRAPH_FRONTMATTER_KEYS) {
    const value = doc.frontmatter[key];
    if (typeof value === 'string') {
      if (value.trim()) refs.push({ key, ref: value.trim() });
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) refs.push({ key, ref: entry.trim() });
      }
    }
  }
  return refs;
}

function nodeRow(node: KnowledgeGraphNode) {
  const target = resolveNodeAgentTarget(node);
  return {
    slug: target.ref ?? node.id,
    kind: node.kind,
    title: node.title,
    hasDocument: target.documented,
  };
}

export function createToolExecutor(port: VaultReadPort) {
  const resolve = buildResolver(port);
  const docBySlug = new Map<string, VaultReadDoc>(port.docs.map((doc) => [doc.slug, doc]));

  function neighborsOf(node: KnowledgeGraphNode, direction: string) {
    const rows: Array<{ from: string; to: string; type: string; why?: string }> = [];
    for (const edge of port.edges) {
      const outgoing = edge.from === node.id;
      const incoming = edge.to === node.id;
      if (!outgoing && !incoming) continue;
      if (direction === 'outgoing' && !outgoing) continue;
      if (direction === 'incoming' && !incoming) continue;
      const fromNode = port.nodes.find((candidate) => candidate.id === edge.from);
      const toNode = port.nodes.find((candidate) => candidate.id === edge.to);
      rows.push({
        from: fromNode ? (resolveNodeAgentTarget(fromNode).ref ?? edge.from) : edge.from,
        to: toNode ? (resolveNodeAgentTarget(toNode).ref ?? edge.to) : edge.to,
        type: edge.type,
        ...(edge.label ? { why: edge.label } : {}),
      });
    }
    return rows;
  }

  async function readConcept(slugInput: string, bodyMode: 'excerpt' | 'full' = 'full') {
    const node = resolve(slugInput);
    if (!node) {
      return {
        found: false as const,
        payload: {
          slug: slugInput,
          found: false,
          hint: 'No concept with that name. Use list_concepts() to see every slug, or find_evidence({title}) to search by title. Do not guess a different slug.',
        },
      };
    }
    const target = resolveNodeAgentTarget(node);
    if (!target.documented) {
      // #691 계보 — 이름만 불린 개념은 "없음" 이 아니다. 누가 부르는지와
      // 문서를 만드는 길을 준다. 오타 추측으로 엉뚱한 노드를 들이밀지 않는다.
      const referencedBy = port.edges
        .filter((edge) => edge.to === node.id || edge.from === node.id)
        .map((edge) => (edge.to === node.id ? edge.from : edge.to))
        .map((id) => port.nodes.find((candidate) => candidate.id === id))
        .map((candidate) => (candidate ? (resolveNodeAgentTarget(candidate).ref ?? '') : ''))
        .filter(Boolean)
        .slice(0, 20);
      return {
        found: true as const,
        slug: target.ref ?? node.id,
        payload: {
          slug: target.ref ?? node.id,
          title: node.title,
          kind: node.kind,
          hasDocument: false,
          referencedBy,
          hint: 'This concept is only named inside other documents — it has no file yet. To give it one, propose add_concept with this exact name.',
        },
        vaultChars: 0,
      };
    }
    const slug = target.ref as string;
    const doc = docBySlug.get(slug);
    const fullBody = (await port.readDocText(slug)) ?? doc?.excerpt ?? '';
    // 이 표면의 기본값은 **전체 본문**이다 — MCP 와 달리 여기는 사용자 자기
    // 디스크를 직접 읽고 왕복 비용이 없다. `body: 'excerpt'` 는 훑어보기용
    // 축약을 명시적으로 요청할 때만. 어느 쪽이든 잘렸는지는 말한다.
    const body = bodyMode === 'excerpt' ? (doc?.excerpt ?? fullBody) : fullBody;
    return {
      found: true as const,
      slug,
      payload: {
        slug,
        title: node.title,
        kind: node.kind,
        hasDocument: true,
        path: doc?.path,
        // 동시 수정 가드의 근거 — patch 제안은 이 값을 실어야 한다.
        mtime: doc?.mtime,
        frontmatter: doc?.frontmatter,
        body: wrapUntrusted(body),
        bodyInfo: {
          mode: bodyMode,
          totalChars: fullBody.length,
          returnedChars: body.length,
          truncated: body.length < fullBody.length,
        },
        neighbors: neighborsOf(node, 'both').slice(0, 40),
      },
      vaultChars: body.length,
    };
  }

  return async function execute(call: NormalizedToolCall): Promise<ToolExecution> {
    const tool = findAgentTool(call.name);
    if (!tool) {
      return {
        content: `Unknown tool "${call.name}". Only the listed tools exist.`,
        isError: true,
        outcome: 'unknown-tool',
        target: call.name,
        summary: '쓸 수 없는 도구',
        readSlugs: [],
        vaultChars: 0,
      };
    }
    if (call.argsInvalid) {
      return {
        content: 'Could not read the arguments as JSON. Send the arguments again as valid JSON.',
        isError: true,
        outcome: 'args-invalid',
        target: call.name,
        summary: '도구 인자를 읽지 못함',
        readSlugs: [],
        vaultChars: 0,
      };
    }

    const args = asArgs(call.args);

    // ── 쓰기: 실행하지 않는다. 제안으로만 나간다. ────────────────────────
    if (tool.effect === 'write') {
      const bodies = call.name === 'add_concepts' && Array.isArray(args.concepts)
        ? args.concepts.map((row) => asArgs(row).body)
        : [args.body];
      if (bodies.some(containsCompetencyQualification)) {
        return {
          content: SOURCE_BACKED_COMPETENCY_MESSAGE,
          isError: true,
          outcome: 'error',
          target: str(args.slug) ?? call.name,
          summary: '소스 근거 자격은 MCP에서만 가능',
          readSlugs: [],
          vaultChars: 0,
        };
      }
      return {
        content:
          'Recorded as a proposal. Nothing was written — the person reviews the exact files and content and decides. Continue explaining your reasoning; do not repeat this call.',
        isError: false,
        outcome: 'blocked-write',
        target: str(args.slug) ?? str(args.from) ?? call.name,
        summary: '제안으로 담음 (아직 쓰지 않음)',
        readSlugs: [],
        vaultChars: 0,
        writeIntent: { name: call.name, args: call.args },
      };
    }

    switch (call.name) {
      case 'get_concept': {
        const slug = str(args.slug);
        if (!slug) return missingArg('slug');
        const result = await readConcept(slug, args.body === 'excerpt' ? 'excerpt' : 'full');
        const packed = pack(result.payload);
        return {
          content: packed.content,
          isError: !result.found,
          outcome: result.found ? 'ok' : 'error',
          target: slug,
          summary: result.found ? `읽음: ${slug}` : `찾지 못함: ${slug}`,
          readSlugs: result.found && result.slug ? [result.slug] : [],
          vaultChars: result.vaultChars ?? 0,
        };
      }

      case 'get_concepts': {
        const slugs = Array.isArray(args.slugs)
          ? (args.slugs as unknown[]).map((value) => str(value)).filter(Boolean)
          : [];
        if (slugs.length === 0) return missingArg('slugs');
        const rows: ConceptEvidenceInput[] = [];
        const batchBodyMode = args.body === 'excerpt' ? 'excerpt' : 'full';
        for (const slug of slugs.slice(0, 50)) {
          const result = await readConcept(slug as string, batchBodyMode);
          rows.push({
            payload: result.payload,
            excerpt: result.slug ? (docBySlug.get(result.slug)?.excerpt ?? '') : '',
          });
        }
        const packed = packConceptEvidence(rows);
        const omission = packed.omittedCount > 0 ? ` · 상한으로 ${packed.omittedCount}개 생략` : '';
        return {
          content: packed.content,
          isError: false,
          outcome: 'ok',
          target: `${slugs.length}개`,
          summary: `읽음: 개념 ${packed.deliveredSlugs.length}/${slugs.length}개${omission}`,
          readSlugs: packed.deliveredSlugs,
          vaultChars: packed.vaultChars,
        };
      }

      case 'list_kinds': {
        const byKind: Record<string, number> = {};
        let referencedOnly = 0;
        for (const node of port.nodes) {
          if (resolveNodeAgentTarget(node).documented) {
            byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
          } else {
            referencedOnly += 1;
          }
        }
        const documentTotal = Object.values(byKind).reduce((sum, n) => sum + n, 0);
        // 필드 이름까지 MCP `list_kinds` 와 같다 — 계약 테스트가 대조한다.
        // #691 — 문서 수와 "이름만 불린 개념" 수를 함께 말한다. 한쪽만
        // 말하면 화면과 에이전트가 다른 숫자를 믿는다.
        const packed = pack({
          total: documentTotal,
          byKind,
          referencedOnlyTotal: referencedOnly,
          conceptsIncludingReferenced: documentTotal + referencedOnly,
        });
        return {
          content: packed.content,
          isError: false,
          outcome: 'ok',
          target: '',
          summary: `읽음: 종류별 개수 (문서 ${documentTotal}개)`,
          readSlugs: [],
          vaultChars: 0,
        };
      }

      case 'list_concepts': {
        const kind = str(args.kind);
        const domain = str(args.domain);
        const since = num(args.since);
        const wantSummary = args.summary === true;
        const offset = Math.max(num(args.offset) ?? 0, 0);
        const limit = Math.min(Math.max(num(args.limit) ?? 100, 1), 500);
        const filtered = port.docs
          .filter((doc) => (kind ? doc.kind === kind : true))
          .filter((doc) => (domain ? doc.domain === domain : true))
          .filter((doc) => (since === undefined ? true : (doc.mtime ?? 0) > since))
          .sort((a, b) => a.slug.localeCompare(b.slug));
        if (offset > filtered.length) {
          return {
            content: JSON.stringify({
              ok: false,
              errorCode: 'invalid_arguments',
              error: `offset must be less than or equal to the total matching nodes (${filtered.length}); Received: ${offset}.`,
            }),
            isError: true,
            outcome: 'args-invalid',
            target: kind ?? domain ?? '',
            summary: '목록 범위를 벗어난 offset이라 중단함',
            readSlugs: [],
            vaultChars: 0,
          };
        }
        const rows = filtered
          .slice(offset, offset + limit)
          .map((doc) => ({
            slug: doc.slug,
            kind: doc.kind,
            title: doc.title,
            ...(doc.domain ? { domain: doc.domain } : {}),
            ...(doc.mtime ? { mtime: doc.mtime } : {}),
            ...(wantSummary ? { summary: wrapUntrusted(doc.excerpt) } : {}),
          }));
        const hasMore = offset + rows.length < filtered.length;
        const packed = pack({
          rows,
          returned: rows.length,
          total: filtered.length,
          limited: hasMore,
          pagination: {
            offset,
            limit,
            total: filtered.length,
            returned: rows.length,
            hasMore,
            nextOffset: hasMore ? offset + rows.length : null,
          },
          vaultDocumentTotal: port.docs.length,
        });
        return {
          content: packed.content,
          isError: false,
          outcome: 'ok',
          target: kind ?? domain ?? '',
          summary: `읽음: 개념 목록 ${rows.length}개`,
          readSlugs: rows.map((row) => row.slug),
          vaultChars: wantSummary ? rows.reduce((sum, row) => sum + (row.summary?.length ?? 0), 0) : 0,
        };
      }

      case 'find_evidence': {
        const title = str(args.title);
        if (!title) return missingArg('title');
        const needle = title.toLowerCase();
        const limit = Math.min(Math.max(num(args.limit) ?? 20, 1), 500);
        const matches = port.nodes
          .filter((node) => node.title.toLowerCase().includes(needle))
          .slice(0, limit)
          .map(nodeRow);
        const packed = pack({ query: title, matches });
        return {
          content: packed.content,
          isError: false,
          outcome: 'ok',
          target: title,
          summary: `확인: "${title}" 비슷한 개념 ${matches.length}개`,
          readSlugs: matches.map((row) => row.slug),
          vaultChars: 0,
        };
      }

      case 'find_backlinks': {
        const slug = str(args.slug);
        if (!slug) return missingArg('slug');
        const node = resolve(slug);
        if (!node) return notFound(slug);
        const canonical = resolveNodeAgentTarget(node).ref ?? node.id;
        const backlinks: Array<{ slug: string; kind: string; matchedKeys: string[] }> = [];
        for (const doc of port.docs) {
          if (doc.slug === canonical) continue;
          const matchedKeys: string[] = [];
          for (const { key, ref } of frontmatterRefs(doc)) {
            const resolved = resolve(ref);
            const resolvedRef = resolved ? (resolveNodeAgentTarget(resolved).ref ?? '') : ref;
            if (resolvedRef !== canonical) continue;
            if (!matchedKeys.includes(key)) matchedKeys.push(key);
          }
          if (matchedKeys.length > 0) {
            backlinks.push({ slug: doc.slug, kind: doc.kind, matchedKeys });
          }
        }
        const packed = pack({ slug: canonical, backlinks });
        return {
          content: packed.content,
          isError: false,
          outcome: 'ok',
          target: slug,
          summary: `읽음: ${slug} 를 가리키는 곳 ${backlinks.length}개`,
          readSlugs: [slug],
          vaultChars: 0,
        };
      }

      case 'find_neighbors': {
        const slug = str(args.slug);
        if (!slug) return missingArg('slug');
        const node = resolve(slug);
        if (!node) return notFound(slug);
        const direction = str(args.direction) ?? 'both';
        const types = Array.isArray(args.types)
          ? new Set((args.types as unknown[]).map((value) => String(value)))
          : null;
        const limit = Math.min(Math.max(num(args.limit) ?? 100, 1), 500);
        const edges = neighborsOf(node, direction)
          .filter((edge) => (types ? types.has(edge.type) : true))
          .slice(0, limit);
        const packed = pack({ slug, edges });
        return {
          content: packed.content,
          isError: false,
          outcome: 'ok',
          target: slug,
          summary: `읽음: ${slug} 의 이웃 ${edges.length}개`,
          readSlugs: [slug],
          vaultChars: 0,
        };
      }

      case 'find_path': {
        const from = str(args.from);
        const to = str(args.to);
        if (!from) return missingArg('from');
        if (!to) return missingArg('to');
        const fromNode = resolve(from);
        const toNode = resolve(to);
        if (!fromNode) return notFound(from);
        if (!toNode) return notFound(to);
        const maxHops = Math.min(Math.max(num(args.maxHops) ?? 5, 0), 20);
        const path = breadthFirstPath(port.edges, fromNode.id, toNode.id, maxHops);
        const hops = path?.map((id) => {
          const node = port.nodes.find((candidate) => candidate.id === id);
          return node ? (resolveNodeAgentTarget(node).ref ?? id) : id;
        });
        const packed = pack({ from, to, found: Boolean(path), hops: hops ?? [] });
        return {
          content: packed.content,
          isError: false,
          outcome: 'ok',
          target: `${from} → ${to}`,
          summary: path ? `읽음: 길 ${path.length - 1}칸` : '읽음: 이어진 길 없음',
          readSlugs: [from, to],
          vaultChars: 0,
        };
      }

      case 'find_orphans': {
        const kind = str(args.kind);
        const excludeKinds = new Set(
          Array.isArray(args.excludeKinds)
            ? (args.excludeKinds as unknown[]).map((value) => String(value))
            : ['project', 'vault-readme'],
        );
        const connected = new Set<string>();
        for (const edge of port.edges) {
          connected.add(edge.from);
          connected.add(edge.to);
        }
        const orphans = port.nodes
          .filter((node) => resolveNodeAgentTarget(node).documented)
          .filter((node) => !connected.has(node.id))
          .filter((node) => (kind ? node.kind === kind : !excludeKinds.has(node.kind)))
          .map(nodeRow);
        const packed = pack({ orphans });
        return {
          content: packed.content,
          isError: false,
          outcome: 'ok',
          target: kind ?? '',
          summary: `읽음: 이어진 곳 없는 개념 ${orphans.length}개`,
          readSlugs: orphans.map((row) => row.slug),
          vaultChars: 0,
        };
      }

      case 'validate_vault': {
        const missingDomain = port.docs
          .filter((doc) => doc.kind === 'capability' || doc.kind === 'element')
          .filter((doc) => !doc.domain)
          .map((doc) => doc.slug);
        const danglingRefs = port.nodes
          .filter((node) => !resolveNodeAgentTarget(node).documented)
          .map((node) => resolveNodeAgentTarget(node).ref)
          .filter((ref): ref is string => Boolean(ref));
        const packed = pack({
          missingExpectedField: { domain: missingDomain },
          referencedWithoutDocument: danglingRefs.slice(0, 100),
          referencedWithoutDocumentTotal: danglingRefs.length,
        });
        return {
          content: packed.content,
          isError: false,
          outcome: 'ok',
          target: '',
          summary: `읽음: 정합성 점검 (보완할 곳 ${missingDomain.length}개)`,
          readSlugs: [],
          vaultChars: 0,
        };
      }

      default:
        return {
          content: `Tool "${call.name}" is listed but not wired.`,
          isError: true,
          outcome: 'error',
          target: call.name,
          summary: '실패: 아직 연결되지 않은 도구',
          readSlugs: [],
          vaultChars: 0,
        };
    }
  };

  function missingArg(name: string): ToolExecution {
    return {
      content: `Missing required argument "${name}".`,
      isError: true,
      outcome: 'args-invalid',
      target: name,
      summary: `건너뜀: ${name} 인자가 없음`,
      readSlugs: [],
      vaultChars: 0,
    };
  }

  function notFound(slug: string): ToolExecution {
    return {
      content: `No concept named "${slug}". Use list_concepts() to see every slug, or find_evidence({title}) to search by title. Do not guess a different slug.`,
      isError: true,
      outcome: 'error',
      target: slug,
      summary: `실패: ${slug} 를 찾지 못함`,
      readSlugs: [],
      vaultChars: 0,
    };
  }
}

function breadthFirstPath(
  edges: readonly KnowledgeGraphEdge[],
  from: string,
  to: string,
  maxHops: number,
): string[] | null {
  if (from === to) return [from];
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge.from]);
  }
  const queue: Array<{ id: string; path: string[] }> = [{ id: from, path: [from] }];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const current = queue.shift() as { id: string; path: string[] };
    if (current.path.length > maxHops) continue;
    for (const next of adjacency.get(current.id) ?? []) {
      if (seen.has(next)) continue;
      const path = [...current.path, next];
      if (next === to) return path;
      seen.add(next);
      queue.push({ id: next, path });
    }
  }
  return null;
}
