import { describe, expect, it } from "vitest";
import { resolveDisplayReleaseTag } from "./pending-release-tag";

describe("표시할 릴리스 태그 — 게시된 것만 생성 파일이 말한다", () => {
  it("게시됐으면 실제로 나간 태그를 말한다", () => {
    expect(
      resolveDisplayReleaseTag({
        published: true,
        publishedTag: "v1.0.0-rc.2",
        releaseVersion: "1.0.0-rc.3",
      }),
    ).toBe("v1.0.0-rc.2");
  });

  /**
   * 결함의 정확한 재현 — 버전은 rc.3 인데 생성 파일은 rc.2 에 머물러 있고
   * 아직 아무것도 게시되지 않은 구간. 이때 화면은 rc.3 이라고 말해야 한다.
   * 종전에는 제목이 rc.3, 본문이 rc.2 로 **한 화면에서 갈렸다**.
   */
  it("아직 안 나갔으면 지금 저장소의 버전을 말한다", () => {
    expect(
      resolveDisplayReleaseTag({
        published: false,
        publishedTag: "v1.0.0-rc.2",
        releaseVersion: "1.0.0-rc.3",
      }),
    ).toBe("v1.0.0-rc.3");
  });

  it("미게시 표시는 제목과 본문이 같은 값을 쓴다", () => {
    const args = { published: false, publishedTag: "v0.0.0", releaseVersion: "1.2.3" } as const;
    expect(resolveDisplayReleaseTag(args)).toBe(resolveDisplayReleaseTag(args));
    expect(resolveDisplayReleaseTag(args)).toBe("v1.2.3");
  });
});
