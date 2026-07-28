import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 공방의 "문서 만들고 저장" 회귀 게이트 (2026-07-27 실측).
 *
 * 두 가지가 동시에 깨져 있었다:
 *
 * 1. **쓰기는 성공했는데 화면은 "못 찾겠다" 였다.** 이름만 불린 개념을
 *    실체화하면 그 개념의 id 가 별칭
 *    (`element:srcentitiesdocs-vaultlibderive-ontology-from-vaultts`)에서
 *    문서 기준(`element:derive-ontology-from-vault.ts`)으로 바뀌는데, 저장 뒤
 *    주소에 옛 별칭이 그대로 남아 에러 화면이 떴다. 앱이 시킨 대로 한 사람이
 *    보상으로 에러를 받는 자리다.
 * 2. **만들어진 문서의 `title:` 이 원본 코드 경로였다.** 저장 전까지 어디서나
 *    보이던 사람 이름이 파일 어디에도 남지 않았다 — 파일에 남는 값이라 한 번
 *    잘못 박히면 사람이 다시 고쳐야 한다.
 */

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createDoc: vi.fn(async () => undefined),
  searchParams: new URLSearchParams(),
  toastShow: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ko",
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/shared/ui", async () => {
  const actual = await vi.importActual<typeof import("@/shared/ui")>("@/shared/ui");
  return { ...actual, useToast: () => ({ show: mocks.toastShow }) };
});

vi.mock("@/features/data-source-mode", () => ({ useDataSourceMode: () => "local" }));

vi.mock("@/entities/ontology-class", () => ({
  useOntologyKindLabel: () => (kind: string) => kind,
}));

/**
 * 도그푸드가 실제로 만드는 모양 그대로: `capability:knowledge-graph` 문서가
 * `elements:` 에 코드 경로를 적어 파생 노드를 낳는다. 파생 노드의 `title` 은
 * 그 참조 원문(=경로), `display` 는 humanizer 가 만든 사람 이름이다.
 */
const DERIVED_REF = "src/entities/docs-vault/lib/derive-ontology-from-vault.ts";
const ALIAS_ID = "element:srcentitiesdocs-vaultlibderive-ontology-from-vaultts";

const nodes = [
  {
    id: "capability:knowledge-graph",
    title: "Knowledge Graph",
    kind: "capability",
    evidenceIds: ["capabilities/knowledge-graph"],
    hasOwnDocument: true,
    agentSlug: "capabilities/knowledge-graph",
    projectIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  },
  {
    id: ALIAS_ID,
    title: DERIVED_REF,
    display: "Derive Ontology From Vault",
    kind: "element",
    evidenceIds: ["capabilities/knowledge-graph"],
    hasOwnDocument: false,
    ref: DERIVED_REF,
    agentSlug: null,
    projectIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  },
];

const edges = [
  {
    id: `capability:knowledge-graph--contains-->${ALIAS_ID}`,
    from: "capability:knowledge-graph",
    to: ALIAS_ID,
    type: "contains",
    projectIds: [],
    evidenceIds: ["capabilities/knowledge-graph"],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  },
];

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({ insight: { nodes, edges } }),
}));

vi.mock("@/features/docs-vault-local", () => ({
  useLocalVault: () => ({
    status: "loaded",
    manifest: { docs: [] },
    createDoc: mocks.createDoc,
    updateFrontmatter: vi.fn(),
  }),
}));

import { OntologyStudioPage } from "./OntologyStudioPage";
import { saveStudioDraft } from "../lib/studio-draft-store";

/** 소켓을 UI 로 채우는 대신 초안으로 심는다 — 이 테스트가 보는 것은 저장 이후다. */
function seedIsARelation() {
  saveStudioDraft(ALIAS_ID, "Derive Ontology From Vault", [
    {
      op: "add",
      relation: "isA",
      target: {
        id: "capability:knowledge-graph",
        title: "Knowledge Graph",
        kind: "capability",
        ref: "capabilities/knowledge-graph",
      },
    },
  ]);
}

describe("공방 — 이름만 있는 개념을 문서로 만들고 저장", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.push.mockClear();
    mocks.createDoc.mockClear();
    mocks.toastShow.mockClear();
    mocks.searchParams = new URLSearchParams({ node: ALIAS_ID });
    seedIsARelation();
  });

  async function saveWithConsent() {
    render(<OntologyStudioPage />);
    await waitFor(() => expect(screen.getByTestId("studio-save")).toBeEnabled());
    fireEvent.click(screen.getByTestId("studio-save"));
    // 문서 없는 개념이므로 동의 다이얼로그가 먼저 뜬다.
    const confirm = await screen.findByTestId("studio-materialize-confirm");
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.createDoc).toHaveBeenCalled());
  }

  it("문서는 인용이 가리키는 자리에 앉고, title 은 경로가 아니라 사람 이름이다", async () => {
    await saveWithConsent();
    const [slug, markdown] = mocks.createDoc.mock.calls[0] as unknown as [string, string];
    expect(slug).toBe(DERIVED_REF);
    expect(markdown).toContain("title: Derive Ontology From Vault");
    expect(markdown).not.toContain(`title: ${DERIVED_REF}`);
    // 관계도 같은 쓰기에 실린다.
    expect(markdown).toContain("broader: [capabilities/knowledge-graph]");
  });

  /**
   * 주소를 **주소로** 검사한다. 종전에는 `router.push` 목이 무엇으로 불렸는지를
   * 봤는데, 공방의 같은-라우트 이동은 2026-07-28 부터 `history.pushState` 로
   * 간다(정적 export 에서 `router.push` 가 같은 경로 + 다른 쿼리로는 아무 일도
   * 안 하기 때문 — `lib/studio-route-params.ts`). 기제가 바뀌어도 이 테스트가
   * 지키려던 사실은 그대로다: **저장 뒤 주소에 옛 별칭이 남지 않는다.**
   */
  it("저장 뒤 새로 만들어진 실제 id 로 이동한다 — 옛 별칭을 주소에 남기지 않는다", async () => {
    await saveWithConsent();
    await waitFor(() =>
      expect(window.location.search).toContain(
        encodeURIComponent("element:derive-ontology-from-vault.ts"),
      ),
    );
    expect(window.location.search).not.toContain(ALIAS_ID);
  });

  it("주소가 바뀌기 전 한 프레임 동안 '못 찾겠다' 를 보여주지 않는다", async () => {
    await saveWithConsent();
    // 저장 직후 그래프에서 별칭 노드가 사라져도(=재적재) 에러 화면이 아니라
    // 여는 중이라고 말한다.
    expect(screen.queryByText("notFound.title")).toBeNull();
  });
});
