import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import enMessages from "../../../../messages/en.json";
import { OntologyInspector, type VaultSelected } from "./OntologyInspector";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

/**
 * 인스펙터 라벨-입력 연결 회귀 가드 (#296).
 *
 * LiteralEditor / ArrayKeyEditor 의 필드 라벨이 `htmlFor` 로, 입력이 같은 `id` 로
 * 연결돼야 접근성 트리에서 입력의 accessible name 이 visible 라벨이 된다. #296
 * 이전엔 라벨이 `<p>` 라 연결이 없어 accessible name 이 placeholder 로 떨어졌다.
 * editable(writable vault) 분기에서 9개 에디터의 label↔input 연결을 단언한다.
 */

const node: VaultSelected = {
  slug: "ontology/capabilities/sample",
  kind: "capability",
  title: "Sample",
  description: "a sample node",
  domain: "sample-domain",
  domains: ["d1"],
  capabilities: ["c1"],
  elements: ["e1"],
  dependencies: ["dep1"],
  contains: [],
  describes: [],
  relates: [],
};

function renderInspector() {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <OntologyInspector
        ephemeralSelected={null}
        vaultSelected={node}
        vaultReadOnly={false}
        onEditVaultLiteral={() => {}}
        onEditVaultArrayKey={() => {}}
        onRenameEphemeral={() => {}}
        onClearSelection={() => {}}
        onToggleCollapsed={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

function renderEnglishInspector() {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <OntologyInspector
        ephemeralSelected={null}
        vaultSelected={node}
        vaultReadOnly={false}
        onEditVaultLiteral={() => {}}
        onEditVaultArrayKey={() => {}}
        onRenameEphemeral={() => {}}
        onClearSelection={() => {}}
        onToggleCollapsed={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

function renderEphemeralInspector(
  title = "Access Control",
  props: {
    onSaveEphemeral?: () => void;
    isEphemeralSaveConflict?: (kind: string, title: string) => boolean;
    getEphemeralSaveSuggestion?: (
      kind: string,
      title: string,
    ) => { title: string; path: string } | null;
    onRenameEphemeral?: (id: string, title: string) => void;
  } = {},
) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <OntologyInspector
        ephemeralSelected={{
          id: "ephemeral-domain-1",
          kind: "domain",
          kindLabel: "도메인",
          title,
          x: 240,
          y: 160,
        }}
        vaultSelected={null}
        untitledPlaceholder="(이름 입력)"
        onRenameEphemeral={props.onRenameEphemeral ?? (() => {})}
        onSaveEphemeral={props.onSaveEphemeral ?? (() => {})}
        isEphemeralSaveConflict={props.isEphemeralSaveConflict}
        getEphemeralSaveSuggestion={props.getEphemeralSaveSuggestion}
        onClearSelection={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

const LITERAL_EDITOR_IDS = [
  "literal-domain",
  "literal-description",
];

const ARRAY_EDITOR_IDS = [
  "array-domains",
  "array-capabilities",
  "array-elements",
  "array-dependencies",
  "array-contains",
  "array-describes",
  "array-relates",
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OntologyInspector 라벨-입력 연결 (a11y, #296)", () => {
  it.each(LITERAL_EDITOR_IDS)("문서 탭의 '%s' 라벨이 같은 id 의 입력과 연결돼 있다", (id) => {
    const { container } = renderInspector();
    fireEvent.click(screen.getByRole("tab", { name: "문서" }));
    const label = container.querySelector(`label[for="${id}"]`);
    const field = container.querySelector(`#${id}`);
    expect(label, `label[for="${id}"] 가 있어야 한다`).not.toBeNull();
    expect(field, `id="${id}" 입력이 있어야 한다`).not.toBeNull();
    // htmlFor 가 실제 입력 요소(input/textarea)를 가리켜야 한다.
    expect(field?.tagName.toLowerCase()).toMatch(/^(input|textarea)$/);
  });

  it.each(ARRAY_EDITOR_IDS)("관계 탭의 '%s' 라벨이 같은 id 의 입력과 연결돼 있다", (id) => {
    const { container } = renderInspector();
    fireEvent.click(screen.getByRole("tab", { name: "관계" }));
    const label = container.querySelector(`label[for="${id}"]`);
    const field = container.querySelector(`#${id}`);
    expect(label, `label[for="${id}"] 가 있어야 한다`).not.toBeNull();
    expect(field, `id="${id}" 입력이 있어야 한다`).not.toBeNull();
    expect(field?.tagName.toLowerCase()).toMatch(/^(input|textarea)$/);
  });

  it("기본 개요 탭은 이름과 경로만 먼저 보여준다", () => {
    renderInspector();

    expect(
      screen.getByRole("complementary", { name: "선택한 온톨로지 개념 상세" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("선택한 개념의 이름·문서·관계를 편집합니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("개념 상세")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "상세 패널 접기 (캔버스 공간 확보)" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("정보 패널")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("이름")).toBeInTheDocument();
    expect(screen.queryByLabelText("한 줄 설명")).toBeNull();
    expect(screen.queryByLabelText("포함된 도메인")).toBeNull();
  });

  it("임시 개념은 저장 전 실제 vault 파일 경로를 미리 보여준다", () => {
    renderEphemeralInspector("Access Control");

    expect(screen.getByText("파일 이름 (저장 시)")).toBeInTheDocument();
    expect(screen.getByText("domains/access-control.md")).toBeInTheDocument();
    expect(screen.getByText("저장 준비됨")).toBeInTheDocument();
    expect(
      screen.getByText("Enter 로 즉시 저장 — 마크다운 (.md) 파일로 작성됩니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText("domain.access-control")).not.toBeInTheDocument();
  });

  it("임시 개념 저장 경로를 agent handoff 용으로 복사할 수 있다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderEphemeralInspector("Access Control");

    fireEvent.click(
      screen.getByRole("button", {
        name: "저장될 파일 경로 복사: domains/access-control.md",
      }),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("domains/access-control.md"),
    );
    expect(await screen.findByText("복사됨")).toBeInTheDocument();
  });

  it("임시 개념을 AI agent handoff packet 으로 복사할 수 있다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderEphemeralInspector("Access Control");

    fireEvent.click(
      screen.getByRole("button", {
        name: "AI agent 에 넘길 임시 개념 packet 복사: domains/access-control.md",
      }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const packet = writeText.mock.calls[0][0] as string;
    expect(packet).toContain("Context Atlas draft ontology concept");
    expect(packet).toContain("kind: domain");
    expect(packet).toContain("title: Access Control");
    expect(packet).toContain("vaultPath: domains/access-control.md");
    expect(packet).toContain('"slug": "domains/access-control"');
    expect(packet).toContain('"kind": "domain"');
    expect(packet).toContain('"title": "Access Control"');
    expect(packet).toContain("validate_vault({ repoRoot })");
    expect(await screen.findByText("Agent packet 복사됨")).toBeInTheDocument();
  });

  it("임시 개념 placeholder 는 실제 저장 전 자동 생성 상태를 파일 경로로 보여준다", () => {
    renderEphemeralInspector("(이름 입력)");

    expect(
      screen.getByText("domains/(이름 입력 후 자동 생성).md"),
    ).toBeInTheDocument();
    expect(screen.getByText("이름 필요")).toBeInTheDocument();
  });

  it("임시 개념 저장 경로가 이미 있으면 저장 버튼을 잠그고 충돌을 보여준다", () => {
    const onSaveEphemeral = vi.fn();
    const onRenameEphemeral = vi.fn();
    renderEphemeralInspector("Ontology Core", {
      onSaveEphemeral,
      onRenameEphemeral,
      isEphemeralSaveConflict: () => true,
      getEphemeralSaveSuggestion: () => ({
        title: "Ontology Core 2",
        path: "domains/ontology-core-2.md",
      }),
    });

    expect(
      screen.getByText(
        "이미 domains/ontology-core.md 파일이 있습니다. 이름을 바꾸면 새 개념으로 저장할 수 있어요.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("경로 충돌")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", {
      name: "이 개념을 로컬 문서함에 .md 파일로 저장",
    });

    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(onSaveEphemeral).not.toHaveBeenCalled();
    expect(
      screen.getByText("같은 파일이 있어 저장할 수 없어요. 이름을 먼저 바꾸세요."),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Ontology Core 2 로 바꾸기 → domains/ontology-core-2.md",
      }),
    );
    expect(onRenameEphemeral).toHaveBeenCalledWith(
      "ephemeral-domain-1",
      "Ontology Core 2",
    );
  });

  it("문서함 편집 footer 가 이름 외 frontmatter 저장 흐름도 설명한다", () => {
    renderInspector();
    fireEvent.click(screen.getByRole("tab", { name: "문서" }));
    const footer = screen.getByText(/설명·도메인은 편집 후 저장되고/);

    expect(footer.textContent).toContain("관계 변경");
    expect(footer.textContent).toContain("로컬 문서함의 같은 .md 파일");
    expect(footer.textContent).not.toContain("이름만");
  });

  it("문서 탭에서 같은 원문 마크다운으로 이동할 수 있다", () => {
    renderInspector();
    fireEvent.click(screen.getByRole("tab", { name: "문서" }));

    const sourceLink = screen.getByRole("link", { name: "문서함에서 열기" });

    expect(sourceLink).toHaveAttribute(
      "href",
      "/docs/?slug=ontology%2Fcapabilities%2Fsample",
    );
    expect(screen.getByText("문서함 원문")).toBeInTheDocument();
    expect(screen.getByText(/문서 앞부분의 속성\(frontmatter\)/)).toBeInTheDocument();
    expect(screen.getByText(/로컬 문서함의 같은 파일/)).toBeInTheDocument();
    expect(screen.getByText("ontology/capabilities/sample.md")).toBeInTheDocument();
  });

  it("영어 사용자 라벨은 inspector 대신 details panel 을 쓴다", () => {
    renderEnglishInspector();

    expect(
      screen.getByRole("complementary", { name: "Selected ontology concept detail" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse details panel (more canvas room)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /inspector/i }),
    ).not.toBeInTheDocument();
  });
});
