import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseDocumentedCollections,
  parseRuledCollections,
  parseDocumentedStoragePaths,
  parseRuledStoragePaths,
} from "../../../scripts/audit-data-model.mjs";

/**
 * T-12. 데이터 모델 세 진실원(DATA-MODEL.md · firestore.rules · 코드) 중
 * 첫 두 개 간 정합성을 vitest에서도 회귀 감시한다. scripts/audit-data-model.mjs
 * 를 CLI로도, 테스트로도 같은 파서로 돌려 결과 일관성을 유지.
 *
 * allowlist(accountMemberships 등)는 mjs 내부에서 관리된다. 이 테스트는 최상위
 * 컬렉션 이름 집합만 비교해, 문서·규칙 어느 한쪽에만 있는 것이 늘어나면 실패.
 */
describe("data model 정합성 감사", () => {
  it("DATA-MODEL.md 문서와 firestore.rules 의 최상위 컬렉션이 서로 어긋나지 않는다", async () => {
    const root = path.resolve(__dirname, "../../..");
    const [md, rules] = await Promise.all([
      readFile(path.join(root, "docs/DATA-MODEL.md"), "utf8"),
      readFile(path.join(root, "firestore.rules"), "utf8"),
    ]);

    const documented = parseDocumentedCollections(md) as Set<string>;
    const { top: ruled } = parseRuledCollections(rules) as { top: Set<string> };

    // allowlist (audit-data-model.mjs 의 isAllowedUndocumentedRule 와 동기)
    const allowed = new Set([
      "accountMemberships",
      // workspaceProjects 는 account-scoped 전용 (최상위 규칙 없음).
      "workspaceProjects",
      // hubs/nodes 는 workspaceProjects 서브컬렉션이 top-level 로 오인됨.
      "hubs",
      "nodes",
      // M2: apiKeys 도 account-scoped 전용.
      "apiKeys",
    ]);

    const onlyDocumented = [...documented].filter(
      (c) => !ruled.has(c) && !allowed.has(c),
    );
    const onlyRuled = [...ruled].filter(
      (c) => !documented.has(c) && !allowed.has(c),
    );

    expect(
      onlyDocumented,
      `DATA-MODEL.md에 있지만 firestore.rules 규칙이 없는 컬렉션: ${onlyDocumented.join(", ")}`,
    ).toEqual([]);
    expect(
      onlyRuled,
      `firestore.rules에 있지만 DATA-MODEL.md 문서가 없는 컬렉션: ${onlyRuled.join(", ")}`,
    ).toEqual([]);
  });

  it("DATA-MODEL.md §5 Storage 트리와 storage.rules 최상위 경로가 서로 어긋나지 않는다", async () => {
    const root = path.resolve(__dirname, "../../..");
    const [md, storage] = await Promise.all([
      readFile(path.join(root, "docs/DATA-MODEL.md"), "utf8"),
      readFile(path.join(root, "storage.rules"), "utf8"),
    ]);

    const documented = parseDocumentedStoragePaths(md) as Set<string>;
    const ruled = parseRuledStoragePaths(storage) as Set<string>;

    const onlyDocumented = [...documented].filter((p) => !ruled.has(p));
    const onlyRuled = [...ruled].filter((p) => !documented.has(p));

    expect(
      onlyDocumented,
      `DATA-MODEL.md §5에 있지만 storage.rules 규칙이 없는 경로: ${onlyDocumented.join(", ")}`,
    ).toEqual([]);
    expect(
      onlyRuled,
      `storage.rules에 있지만 DATA-MODEL.md §5 트리에 없는 경로: ${onlyRuled.join(", ")}`,
    ).toEqual([]);
  });
});
