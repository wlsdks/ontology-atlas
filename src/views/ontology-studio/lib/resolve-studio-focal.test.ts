import { describe, expect, it } from "vitest";
import { resolveStudioEnhanceFocal, resolveStudioFocalId } from "./resolve-studio-focal";
import type { StudioSourceNode } from "./build-studio-item";

/**
 * C3 회귀 — 상단 검색 클릭이 focal 을 안 바꾸던 로컬 vault 조건.
 *
 * 로컬 vault 는 노드 id 가 항상 canonical `kind:slug` 라는 보장이 없다:
 * `?node=` 는 folder-prefixed ref / bare tail / macOS 파일명발 NFD 형식으로도
 * 도착한다. 예전 resolver 의 `n.id === requestedNode` 는 이 전부를 놓쳐 조용히
 * 기본 노드로 되돌아갔다. 각 형식을 재현하고, 관용 resolver 가 canonical id 로
 * 수렴하는지 검증한다.
 */

// 로컬 vault 형태 — 한국어 제목 + canonical id (파일명 슬러그 tail).
const nodes: StudioSourceNode[] = [
  { id: "capability:티켓-분류", title: "티켓 분류", kind: "capability" },
  { id: "capability:응대-작성", title: "응대 작성", kind: "capability" },
  { id: "element:분류-모델", title: "분류 모델", kind: "element" },
  { id: "domain:문의-처리", title: "문의 처리", kind: "domain" },
];

// 예전 strict resolver (수정 전) — 회귀가 실재했음을 문서화하기 위한 대조군.
const strictResolve = (req: string | null) =>
  req && nodes.some((n) => n.id === req) ? req : null;

describe("resolveStudioFocalId — id 형식 관용", () => {
  it("canonical id 는 그대로 매칭한다 (스튜디오 상단 검색 경로)", () => {
    expect(resolveStudioFocalId("capability:티켓-분류", nodes)).toBe("capability:티켓-분류");
  });

  it("folder-prefixed ref 를 canonical id 로 수렴한다 (라우트 메모리·딥링크 복원)", () => {
    // 예전 resolver 는 실패했다 (회귀 재현) — 새 resolver 는 canonical 로 매칭.
    expect(strictResolve("capabilities/티켓-분류")).toBeNull();
    expect(resolveStudioFocalId("capabilities/티켓-분류", nodes)).toBe("capability:티켓-분류");
    expect(resolveStudioFocalId("elements/분류-모델", nodes)).toBe("element:분류-모델");
    expect(resolveStudioFocalId("domains/문의-처리", nodes)).toBe("domain:문의-처리");
  });

  it("NFD(분해형) 파일명 슬러그를 NFC 노드 id 로 폴딩해 매칭한다 (macOS)", () => {
    const nfdReq = "capability:티켓-분류".normalize("NFD");
    expect(nfdReq).not.toBe("capability:티켓-분류"); // 실제로 다른 바이트열
    expect(strictResolve(nfdReq)).toBeNull(); // 회귀 재현
    expect(resolveStudioFocalId(nfdReq, nodes)).toBe("capability:티켓-분류");
    // folder-prefixed + NFD 동시
    expect(resolveStudioFocalId("capabilities/티켓-분류".normalize("NFD"), nodes)).toBe(
      "capability:티켓-분류",
    );
  });

  it("bare tail slug 을 유일 매칭일 때만 수렴한다 (topology ?p= 핸드오프)", () => {
    expect(strictResolve("티켓-분류")).toBeNull(); // 회귀 재현
    expect(resolveStudioFocalId("티켓-분류", nodes)).toBe("capability:티켓-분류");
  });

  it("bare tail 이 2개 이상 노드와 겹치면 추측하지 않고 null (기본 노드 fallback)", () => {
    const ambiguous: StudioSourceNode[] = [
      { id: "capability:분류", title: "분류(역량)", kind: "capability" },
      { id: "element:분류", title: "분류(요소)", kind: "element" },
    ];
    // canonical 은 유일 매칭이 되게, bare 는 모호하게.
    expect(resolveStudioFocalId("capability:분류", ambiguous)).toBe("capability:분류");
    expect(resolveStudioFocalId("분류", ambiguous)).toBeNull();
  });

  it("없는 노드·빈 입력은 null", () => {
    expect(resolveStudioFocalId(null, nodes)).toBeNull();
    expect(resolveStudioFocalId("", nodes)).toBeNull();
    expect(resolveStudioFocalId("capability:없는거", nodes)).toBeNull();
  });
});

describe("resolveStudioEnhanceFocal — 죽은 딥링크는 조용히 바뀌지 않는다", () => {
  it("요청한 노드가 없으면 기본 노드로 갈아끼우지 않고 '없음'을 알린다", () => {
    // 회귀 재현: 예전엔 `?? selectDefaultStudioNodeId(...)` 때문에 아무
    // 노드나 열렸고, 사용자는 그게 요청한 노드인 줄 알았다.
    const result = resolveStudioEnhanceFocal("capability:없는거", nodes, []);
    expect(result).toEqual({ focalId: null, requestedMissing: true });
  });

  it("요청한 노드가 있으면 그 노드를 연다", () => {
    expect(resolveStudioEnhanceFocal("capability:티켓-분류", nodes, [])).toEqual({
      focalId: "capability:티켓-분류",
      requestedMissing: false,
    });
  });

  it("요청이 아예 없으면 기본 노드를 연다 (이건 대체가 아니라 진입점)", () => {
    const result = resolveStudioEnhanceFocal(null, nodes, []);
    expect(result.requestedMissing).toBe(false);
    expect(result.focalId).not.toBeNull();
  });

  it("그래프가 아직 비어 있으면 '없다'고 단정하지 않는다 (로딩 · 볼트 미선택)", () => {
    expect(resolveStudioEnhanceFocal("capability:티켓-분류", [], [])).toEqual({
      focalId: null,
      requestedMissing: false,
    });
  });
});
