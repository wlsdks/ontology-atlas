/**
 * Canonical node ID 매핑 + stub placeholder 헬퍼.
 *
 * resolveCanonicalNodeId — frontmatter id 우선, 없으면 legacy slug
 * createStubPlaceholder — relates.target 미존재 시 placeholder 노드 빌드
 *
 * 결정 문서: 2026-04-27-ontology-id-resolution.md §1·§2
 */

import type {
  CanonicalIdResult,
  CanonicalizeInput,
  CreateStubInput,
  StubNodeRecord,
} from "./types";

/** kebab-case 정규화 — 한글 보존, 영문 lowercase, 그 외 하이픈. */
export function normalizeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

/**
 * canonical node ID 결정.
 *
 * 우선순위:
 *   1. frontmatterId 가 있고 frontmatterKind 가 있으면 → `<frontmatterKind>:<frontmatterId>`
 *      (kind 충돌 시 — extracted kind ≠ frontmatterKind — frontmatter 가 우선이지만 conflictWarning 첨부)
 *   2. frontmatterId 만 있으면 (kind 누락은 거의 없는 case 지만 일관성) → `<extractedKind>:<frontmatterId>`
 *   3. 둘 다 없으면 legacy slug:
 *      `<extractedKind>:<projectScopeSlug>:<titleSlug>` (project scope 없으면 `global`)
 */
export function resolveCanonicalNodeId(
  input: CanonicalizeInput,
): CanonicalIdResult {
  const { kind, title, primaryProjectId, frontmatterId, frontmatterKind } = input;

  if (frontmatterId) {
    // kind 가 명시된 경우 frontmatter 우선. 충돌 시 warning.
    if (frontmatterKind) {
      const conflictWarning =
        frontmatterKind !== kind
          ? `frontmatter kind="${frontmatterKind}" 가 추출 kind="${kind}" 와 충돌 — frontmatter 우선 적용 (검수 시 확인 필요)`
          : undefined;
      return {
        canonicalId: `${frontmatterKind}:${frontmatterId}`,
        resolvedKind: frontmatterKind,
        source: "frontmatter-id",
        ...(conflictWarning ? { conflictWarning } : {}),
      };
    }
    return {
      canonicalId: `${kind}:${frontmatterId}`,
      resolvedKind: kind,
      source: "frontmatter-id",
    };
  }

  // legacy slug — projectScope:titleSlug
  const scopeSlug = primaryProjectId ? normalizeSlug(primaryProjectId) : "global";
  const titleSlug = normalizeSlug(title);
  return {
    canonicalId: `${kind}:${scopeSlug}:${titleSlug}`,
    resolvedKind: kind,
    source: "legacy-slug",
  };
}

/**
 * 같은 canonical ID 를 두 문서가 (다른 kind 로) 가리키는 충돌 검출.
 *
 * 호출자: 워커 / approval flow 에서 batch 단위로 매핑한 결과를 모아 호출.
 * 반환: 충돌이 있는 canonicalId → 사용된 kind 들 목록.
 */
export function detectCanonicalConflicts(
  results: ReadonlyArray<CanonicalIdResult & { sourceTempId: string }>,
): Array<{ canonicalId: string; kinds: string[]; sourceTempIds: string[] }> {
  const byId = new Map<string, { kinds: Set<string>; tempIds: string[] }>();
  for (const r of results) {
    const idOnly = r.canonicalId.split(":").slice(1).join(":");
    const slot = byId.get(idOnly);
    if (slot) {
      slot.kinds.add(r.resolvedKind);
      slot.tempIds.push(r.sourceTempId);
    } else {
      byId.set(idOnly, {
        kinds: new Set([r.resolvedKind]),
        tempIds: [r.sourceTempId],
      });
    }
  }
  const conflicts: Array<{
    canonicalId: string;
    kinds: string[];
    sourceTempIds: string[];
  }> = [];
  for (const [id, slot] of byId) {
    if (slot.kinds.size > 1) {
      conflicts.push({
        canonicalId: id,
        kinds: [...slot.kinds].sort(),
        sourceTempIds: slot.tempIds,
      });
    }
  }
  return conflicts;
}

/**
 * stub placeholder 노드 빌드.
 *
 * canonical ID = `unknown:<normalizedTargetId>`
 * 원본 frontmatter 의 edge type 은 stub 노드 메타 (`pendingType`) 에 보존.
 * 실제 edge 생성 시는 type 을 `related_to` 로 강등 (id-resolution.md §2.3).
 */
export function createStubPlaceholder(input: CreateStubInput): StubNodeRecord {
  const { targetId, declaredType, pendingFromId, evidenceDocumentId } = input;
  const normalizedTarget = normalizeSlug(targetId);
  return {
    id: `unknown:${normalizedTarget}`,
    title: targetId, // 검수자가 promote 시 갱신
    kind: "unknown",
    projectIds: [],
    evidenceIds: [evidenceDocumentId],
    isStub: true,
    pendingType: declaredType,
    pendingFromId,
  };
}

/**
 * 같은 stub 이 여러 frontmatter 에서 만들어질 수 있음 — 병합 (evidenceIds 누적).
 * 호출자: 워커가 한 batch 안에서 stub 후보들을 dedupe 할 때.
 */
export function mergeStubPlaceholders(
  stubs: ReadonlyArray<StubNodeRecord>,
): StubNodeRecord[] {
  const byId = new Map<string, StubNodeRecord>();
  for (const stub of stubs) {
    const existing = byId.get(stub.id);
    if (existing) {
      // evidenceIds 누적 (중복 제거)
      const merged = new Set([...existing.evidenceIds, ...stub.evidenceIds]);
      byId.set(stub.id, { ...existing, evidenceIds: [...merged] });
    } else {
      byId.set(stub.id, stub);
    }
  }
  return [...byId.values()];
}
