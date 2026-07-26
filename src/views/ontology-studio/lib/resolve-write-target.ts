/**
 * 공방이 **어느 파일에 쓸 것인가** 를 정하는 단일 출처.
 *
 * 왜 필요한가 — vault derive 는 노드를 두 경로로 만든다. frontmatter 에
 * `kind:` 가 있는 문서(자기 slug 를 근거로 가짐)와, 다른 문서의 관계 키에서
 * 이름만 불린 파생 개념(자기를 인용한 *남의* 문서 slug 를 근거로 가짐)이다.
 * 둘 다 `evidenceIds[0]` 한 칸에 담기므로, 쓰기 표면이 그 값을 그대로 쓰면
 * 사용자가 A 에 대해 적은 관계가 B 의 frontmatter 에 앉는다 — 사용자가 한 적
 * 없는 주장이 B 의 문서에 사실로 기록된다.
 *
 * 판정은 읽기 표면과 **같은 함수**(`resolveNodeDocument`)를 쓴다. 여기서 따로
 * 추정하면 오늘 하나로 합친 정의가 다시 갈라진다.
 *
 * `missing` 의 `slug` 는 그 개념을 인용한 문서가 이미 적어 둔 경로(`ref`)다 —
 * 문서를 이 자리에 만들어야 기존 인용이 그대로 이 문서를 가리킨다. 인용
 * 원문이 없는 노드에서만 kind 폴더 규칙으로 되짚는다.
 */

import { resolveNodeAgentTarget, resolveNodeDocument } from "@/entities/knowledge-graph";
import { humanizeCodePathTitle } from "@/shared/lib/humanize-code-path-title";
import { candidateFromNode, CREATE_NODE_KINDS, type CreateNodeKind } from "./build-create-node";

export type StudioWriteTarget =
  /** 자기 `.md` 가 있다 — 거기에 쓴다. */
  | {
      status: "existing";
      /** 디스크에 쓸 때 쓰는 매니페스트 기준 경로 (로컬 볼트 write 대상). */
      slug: string;
      /**
       * 복사해 주는 MCP 명령에 박히는 이름 — 에이전트가 물린 볼트 뿌리 기준.
       * 번들 샘플에서는 매니페스트 경로 앞에 `ontology/` 한 조각이 더 붙어
       * 있어 그대로 넘기면 붙여넣는 즉시 실패한다(2026-07-26 실측).
       */
      agentSlug: string;
    }
  /**
   * 자기 `.md` 가 없다 — 관계를 적어 둘 자리가 아직 없다. 문서를 만들어야
   * 쓸 수 있고, 문서 생성은 사용자 동의 없이는 하지 않는다.
   */
  | {
      status: "missing";
      /** 문서가 앉아야 할 경로 (기존 인용이 가리키는 자리). */
      slug: string;
      /**
       * 새 문서의 `title:`.
       *
       * 이름만 불린 개념의 `title` 은 남의 frontmatter 에 적힌 **참조 원문**
       * 이라, 코드 근거일 때는 `src/entities/.../derive-ontology-from-vault.ts`
       * 같은 경로 그대로다. 그 값을 그대로 `title:` 에 박으면 저장 전까지
       * 지도·공방·피커가 보여 주던 사람 이름("Derive Ontology From Vault")이
       * 어디에도 남지 않고, 문서함 탭·브레드크럼·본문 H1 이 전부 경로가 된다
       * (2026-07-27 실측). 파일에 남는 값이라 한 번 잘못 박히면 사람이 다시
       * 고쳐야 한다.
       *
       * 그래서 읽기 표면이 쓰는 것과 **같은 humanizer** 를 통과시킨다 —
       * `humanizeCodePathTitle` 은 코드 경로가 아니면 null 을 돌려주므로,
       * 사람이 이미 이름으로 적어 둔 참조는 원문 그대로 남는다(매칭의
       * 진실원은 여전히 title 이다).
       */
      title: string;
      /** 네 종류 중 하나로 특정되면 그 값, 아니면 null (사용자가 골라야 한다). */
      kind: CreateNodeKind | null;
      /** 부모 도메인 tail-slug — 알면 새 문서의 `domain:` 으로 적는다. */
      domainValue: string | null;
    };

export interface WriteTargetNode {
  id: string;
  kind: string;
  title: string;
  display?: string;
  evidenceIds?: string[];
  hasOwnDocument?: boolean;
  agentSlug?: string | null;
  /**
   * 이 개념을 인용한 문서가 실제로 적어 둔 참조 문자열
   * (`elements: [src/entities/foo.ts]` 의 그 값). 새 문서는 **이 자리**에
   * 앉아야 기존 인용이 그대로 그 문서를 가리킨다.
   */
  ref?: string;
}

function asCreateKind(kind: string): CreateNodeKind | null {
  return (CREATE_NODE_KINDS as readonly string[]).includes(kind) ? (kind as CreateNodeKind) : null;
}

export function resolveStudioWriteTarget(
  node: WriteTargetNode,
  opts: { domainValue?: string | null } = {},
): StudioWriteTarget {
  const { ownSlug } = resolveNodeDocument({
    evidenceIds: node.evidenceIds ?? [],
    hasOwnDocument: node.hasOwnDocument,
  });
  if (ownSlug) {
    return {
      status: "existing",
      slug: ownSlug,
      agentSlug: resolveNodeAgentTarget(node).ref ?? ownSlug,
    };
  }
  // 인용이 적어 둔 경로를 그대로 쓴다. 노드 id 에서 되짚으면
  // `src/entities/foo.ts` 가 `elements/srcentitiesfoots` 로 뭉개져, 만든
  // 문서를 기존 인용이 못 찾는다 — 문서는 생겼는데 그래프는 그대로 비어
  // 있는 상태가 된다(2026-07-26 실측). id 는 되돌릴 수 없으므로 인용 원문이
  // 있을 때는 그것이 유일하게 맞는 경로다.
  return {
    status: "missing",
    slug: node.ref?.trim() || candidateFromNode(node).ref,
    title: humanizeCodePathTitle(node.title) ?? node.title,
    kind: asCreateKind(node.kind),
    domainValue: opts.domainValue ?? null,
  };
}

/**
 * 문서를 만든 **직후** 그 문서를 가리키는 노드 id.
 *
 * 왜 필요한가 (2026-07-27 실측) — 이름만 불린 개념의 id 는 참조 원문을 뭉갠
 * 별칭이다(`element:srcentitiesdocs-vaultlibderive-ontology-from-vaultts`).
 * 문서를 만들면 그 참조가 진짜 문서로 해석되면서 노드 id 가 파일 이름 기준
 * (`element:derive-ontology-from-vault.ts`)으로 **바뀐다**. 저장이 성공했는데도
 * 주소에 옛 별칭이 남아 있으면 화면은 "이 개념을 찾을 수 없다" 고 말한다 —
 * 앱이 시킨 대로 한 사람이 보상으로 에러 화면을 받는다.
 *
 * 판정은 읽기 표면과 같은 함수(`resolveNodeDocument`) 하나로 한다. 그래프가
 * 이미 새 문서를 알고 있으면 그 노드가 정답이고, 아직 매니페스트가 따라오기
 * 전이면 derive 가 만들 id 를 그대로 계산한다(`kind:파일이름`, project 만
 * frontmatter `slug:` 를 쓰므로 경로 전체).
 */
export function resolveMaterializedNodeId(
  slug: string,
  kind: CreateNodeKind,
  nodes: readonly WriteTargetNode[] = [],
): string {
  const target = slug.normalize("NFC").trim();
  for (const node of nodes) {
    const { ownSlug } = resolveNodeDocument({
      evidenceIds: node.evidenceIds ?? [],
      hasOwnDocument: node.hasOwnDocument,
    });
    if (ownSlug && ownSlug.normalize("NFC").trim() === target) return node.id;
  }
  // project 문서의 id 는 frontmatter `slug:` 로 만들어진다 — 공방이 쓰는 문서는
  // 항상 그 키를 적으므로 경로 전체가 꼬리가 된다. 나머지 종류는 파일 이름.
  if (kind === "project") return `project:${target}`;
  return `${kind}:${target.split("/").pop() || target}`;
}
