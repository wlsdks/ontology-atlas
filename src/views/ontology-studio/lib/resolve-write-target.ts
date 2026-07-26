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
 * `missing` 의 `slug` 는 그 개념을 인용한 문서가 이미 적어 둔 경로다 — 문서를
 * 이 자리에 만들어야 기존 인용이 그대로 이 문서를 가리킨다.
 */

import { resolveNodeDocument } from "@/entities/knowledge-graph";
import { candidateFromNode, CREATE_NODE_KINDS, type CreateNodeKind } from "./build-create-node";

export type StudioWriteTarget =
  /** 자기 `.md` 가 있다 — 거기에 쓴다. */
  | { status: "existing"; slug: string }
  /**
   * 자기 `.md` 가 없다 — 관계를 적어 둘 자리가 아직 없다. 문서를 만들어야
   * 쓸 수 있고, 문서 생성은 사용자 동의 없이는 하지 않는다.
   */
  | {
      status: "missing";
      /** 문서가 앉아야 할 경로 (기존 인용이 가리키는 자리). */
      slug: string;
      /** 새 문서의 `title:` — 표시 이름이 아니라 매칭의 진실원인 원문 title. */
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
  if (ownSlug) return { status: "existing", slug: ownSlug };
  return {
    status: "missing",
    slug: candidateFromNode(node).ref,
    title: node.title,
    kind: asCreateKind(node.kind),
    domainValue: opts.domainValue ?? null,
  };
}
