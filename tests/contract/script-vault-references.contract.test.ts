import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `package.json` 의 스크립트가 가리키는 **볼트 노드가 실재하는가.**
 *
 * ## 왜 이 게이트가 생겼나 — 검증기 아홉이 조용히 썩어 있었다
 *
 * 2026-08-10 전체 검수에서 설치 앱 검증기(`desktop:verify-topology-*`)를 돌려 보니
 * **전부 실패**했다. 원인은 제품이 아니라 검증기였다: 딥링크가
 * `?p=domain%3Aviews` 를 가리키는데 **그 노드가 볼트에 없다.** 도그푸드 볼트를
 * 여러 번 다시 만드는 동안 도메인 이름이 바뀌었고(지금 여섯은
 * `agent-integration` · `graph-modeling` · `local-vault-management` ·
 * `onboarding-and-shell` · `project-portfolio` · `topology-navigation`),
 * `capability%3Atopology-analysis-modes` 도 사라졌다.
 *
 * **이 검증기들은 CI 에 없다** — 설치된 macOS 앱을 구동해야 해서다. 그래서 아무도
 * 몰랐다. 이 저장소가 이미 이름 붙여 둔 실패 그대로다: *"이미 삭제된 testid 나
 * 제목을 기다리는 spec 이 아무 신호 없이 남아 썩는다"*(`testing.md`), 그리고
 * *"게이트가 자기가 검사한다고 말한 것을 한 번도 검사해 본 적 없다"*.
 *
 * ## 그래서 무엇을 잠그나
 *
 * 참조를 고치는 것만으로는 **다음 볼트 재생성에서 또 썩는다.** 그래서 사람이
 * 기억해야 하는 자리를 없앤다: 스크립트에 적힌 노드 참조를 **볼트에서 찾아본다.**
 * 이 시험은 CI 에서 돌므로, 볼트에서 노드를 지우거나 이름을 바꾸면 그 PR 에서
 * 바로 터진다 — 설치 앱을 켜 보지 않아도.
 */

const REPO = process.cwd();
const VAULT = "docs/ontology";

/**
 * `kind%3Aslug` 또는 `kind:slug` → 볼트 파일 경로.
 *
 * ⚠️ 폴더 이름을 `` `${kind}s` `` 로 만들면 안 된다 — `capability` 의 복수는
 * `capabilitys` 가 아니라 **`capabilities`** 다. 처음에 그렇게 썼다가 실재하는
 * 노드를 「없다」고 보고했다(이 게이트가 자기 오류를 먼저 잡았다).
 */
const FOLDER_FOR_KIND: Record<string, string> = {
  project: "projects",
  domain: "domains",
  capability: "capabilities",
  element: "elements",
};

function vaultPathFor(kind: string, slug: string): string {
  const folder = FOLDER_FOR_KIND[kind];
  if (!folder) throw new Error(`알 수 없는 kind: ${kind}`);
  return `${REPO}/${VAULT}/${folder}/${slug}.md`;
}

interface NodeReference {
  readonly script: string;
  readonly kind: string;
  readonly slug: string;
}

function collectReferences(): NodeReference[] {
  const manifest = JSON.parse(readFileSync(`${REPO}/package.json`, "utf8")) as {
    scripts: Record<string, string>;
  };
  const out: NodeReference[] = [];
  // `%3A` 는 URL 안에 인코딩된 콜론이다 — 딥링크가 그 모양으로 적힌다.
  const pattern = /\b(project|domain|capability|element)(?:%3A|:)([a-z0-9][a-z0-9-]*)/g;
  for (const [script, command] of Object.entries(manifest.scripts)) {
    for (const match of command.matchAll(pattern)) {
      out.push({ script, kind: match[1], slug: match[2] });
    }
  }
  return out;
}

describe("스크립트가 가리키는 볼트 노드는 실재해야 한다", () => {
  const references = collectReferences();

  it("이 시험이 빈 집합 위에서 돌지 않는다", () => {
    /*
     * 공회전 차단. 참조가 0개면 위 정규식이 낡았거나 스크립트가 사라진 것이고,
     * 그 상태에서 「위반 0」은 증거가 아니다(`/gate-probe`).
     */
    expect(
      references.length,
      "package.json 에서 볼트 노드 참조를 하나도 못 찾았다 — 정규식이 낡았다",
    ).toBeGreaterThan(0);
  });

  it("참조된 노드가 전부 볼트에 있다", () => {
    const missing = references
      .filter(({ kind, slug }) => !existsSync(vaultPathFor(kind, slug)))
      .map(({ script, kind, slug }) => `${script} → ${kind}:${slug}`);
    expect(
      [...new Set(missing)],
      "스크립트가 볼트에 없는 노드를 가리킨다. 볼트를 다시 만들며 이름이 바뀌었으면 " +
        "스크립트도 같이 고친다 — 설치 앱 검증기는 CI 에 없어서 이 시험이 유일한 눈이다.",
    ).toEqual([]);
  });
});
