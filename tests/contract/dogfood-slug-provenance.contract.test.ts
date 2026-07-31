import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadVaultDocs } from "../../mcp/src/vault.mjs";
import {
  flatSlugIssue,
  CREATED_BY_HUMAN,
  CREATED_BY_AGENT_PREFIX,
} from "../../mcp/src/schema.mjs";

/**
 * 도그푸드 볼트의 두 규격 (2026-08-01):
 *
 * 1. **슬러그는 평평한 식별자다** (`docs/DECISIONS.md` 판정). 재생성 볼트가
 *    `elements/src/views/home` 류 경로형 슬러그 43개를 실었고, 꼬리 별칭
 *    충돌로 화면에서 노드 3→1 접힘 + 관계 4개 소실이 실측됐다. 쓰기 관문
 *    (`flatSlugIssue`) 이 새 유입을 막지만, 관문을 우회한 손 편집이 여기서
 *    잡힌다.
 *
 * 2. **저작 출처는 전 노드에 있다** (소유자 지시 — human 은 「사람 판단이
 *    성립 조건인 노드」: 프로젝트 정의 · 도메인 경계 · 방향 약속 capability.
 *    나머지는 agent:*). 개수는 못 박지 않는다 — 고정 숫자는 볼트가 자랄
 *    때마다 깨지는 소음이다. 값의 형태와 전수(全數) 존재만 계약이다.
 *
 * 이 계약은 dogfood 볼트에만 적용된다 — 일반 사용자 볼트에서 `created_by`
 * 부재는 결함이 아니라 unknown 이다 (2026-07-31 원장).
 */

const VAULT_ROOT = join(process.cwd(), "docs/ontology");
const docs = loadVaultDocs(VAULT_ROOT) as Array<{
  slug: string;
  frontmatter: Record<string, unknown>;
}>;

describe("도그푸드 볼트 — 슬러그 형태와 저작 출처", () => {
  it("볼트가 비어 있지 않다 (계약의 전제)", () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  it("모든 노드의 슬러그가 스키마 폴더 아래에서 평평하다", () => {
    const violations = docs
      .map((doc) => ({
        slug: doc.slug,
        issue: flatSlugIssue(String(doc.frontmatter.kind ?? ""), doc.slug),
      }))
      .filter((row) => row.issue !== null);
    expect(violations).toEqual([]);
  });

  it("모든 노드에 created_by 가 있고 값은 human | agent:* 다", () => {
    const violations = docs
      .map((doc) => ({ slug: doc.slug, value: doc.frontmatter.created_by }))
      .filter(
        (row) =>
          row.value !== CREATED_BY_HUMAN &&
          !(
            typeof row.value === "string" &&
            row.value.startsWith(CREATED_BY_AGENT_PREFIX) &&
            row.value.length > CREATED_BY_AGENT_PREFIX.length
          ),
      );
    expect(violations).toEqual([]);
  });

  it("human 저작이 최소 1개는 있다 — 사람 판단이 성립 조건인 노드가 사라지면 볼트 정체성이 바뀐 것", () => {
    expect(docs.some((doc) => doc.frontmatter.created_by === CREATED_BY_HUMAN)).toBe(
      true,
    );
  });
});
