import { describe, expect, it } from "vitest";

import {
  sectionVisible,
  sectionVisibleForCurrent,
  surfaceForPathname,
} from "./shortcut-scope";

describe("surfaceForPathname", () => {
  it("루트와 /topology 는 지도 표면", () => {
    expect(surfaceForPathname("/")).toBe("topology");
    expect(surfaceForPathname("/topology")).toBe("topology");
    expect(surfaceForPathname("/ko/topology/")).toBe("topology");
  });

  it("/docs 는 문서함 표면", () => {
    expect(surfaceForPathname("/docs")).toBe("docs");
    expect(surfaceForPathname("/en/docs/")).toBe("docs");
  });

  // 공방/인사이트/프로젝트는 전용 단축키가 없다 — 없는 걸 있다고 하지 않는다.
  it("전용 단축키가 없는 화면은 전역만", () => {
    expect(surfaceForPathname("/ko/ontology/studio/")).toBe("global");
    expect(surfaceForPathname("/ko/projects/")).toBe("global");
  });
});

describe("sectionVisible", () => {
  it("'전체' 탭은 모두 보여준다 — 분류로 정보를 잃지 않는다", () => {
    expect(sectionVisible("all", "topology")).toBe(true);
    expect(sectionVisible("all", "docs")).toBe(true);
    expect(sectionVisible("all", "global")).toBe(true);
  });

  it("전역 단축키는 어느 탭에서도 남는다 — 지금 누를 수 있는 키가 사라지면 안 된다", () => {
    expect(sectionVisible("topology", "global")).toBe(true);
    expect(sectionVisible("docs", "global")).toBe(true);
  });

  it("표면 탭은 그 표면만", () => {
    expect(sectionVisible("topology", "topology")).toBe(true);
    expect(sectionVisible("topology", "docs")).toBe(false);
    expect(sectionVisible("docs", "topology")).toBe(false);
  });
});

describe("sectionVisibleForCurrent", () => {
  it("지도에서는 전역 + 지도", () => {
    expect(sectionVisibleForCurrent("topology", "global")).toBe(true);
    expect(sectionVisibleForCurrent("topology", "topology")).toBe(true);
    expect(sectionVisibleForCurrent("topology", "docs")).toBe(false);
  });

  it("전용 단축키가 없는 화면에서는 전역만", () => {
    expect(sectionVisibleForCurrent("global", "global")).toBe(true);
    expect(sectionVisibleForCurrent("global", "topology")).toBe(false);
    expect(sectionVisibleForCurrent("global", "docs")).toBe(false);
  });
});
