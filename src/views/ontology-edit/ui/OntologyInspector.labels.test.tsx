import { describe, expect, it } from "vitest";
import { render as rtlRender } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { OntologyInspector, type VaultSelected } from "./OntologyInspector";

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
      />
    </NextIntlClientProvider>,
  );
}

// 2 literal (domain · description) + 7 array key 에디터.
const EDITOR_IDS = [
  "literal-domain",
  "literal-description",
  "array-domains",
  "array-capabilities",
  "array-elements",
  "array-dependencies",
  "array-contains",
  "array-describes",
  "array-relates",
];

describe("OntologyInspector 라벨-입력 연결 (a11y, #296)", () => {
  it.each(EDITOR_IDS)("'%s' 라벨이 같은 id 의 입력과 연결돼 있다", (id) => {
    const { container } = renderInspector();
    const label = container.querySelector(`label[for="${id}"]`);
    const field = container.querySelector(`#${id}`);
    expect(label, `label[for="${id}"] 가 있어야 한다`).not.toBeNull();
    expect(field, `id="${id}" 입력이 있어야 한다`).not.toBeNull();
    // htmlFor 가 실제 입력 요소(input/textarea)를 가리켜야 한다.
    expect(field?.tagName.toLowerCase()).toMatch(/^(input|textarea)$/);
  });
});
