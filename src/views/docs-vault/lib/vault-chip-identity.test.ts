import { describe, expect, it } from "vitest";
import { resolveVaultChipIdentity } from "./vault-chip-identity";

describe("볼트 칩 정체 — 고른 소스를 말한다", () => {
  it("폴더를 연 로컬은 폴더 이름과 문서 수를 말한다", () => {
    expect(
      resolveVaultChipIdentity({
        source: "local",
        isLocalSourceLoaded: true,
        localFolderName: "my-notes",
      }),
    ).toEqual({ kind: "local", label: "my-notes", showDocCount: true });
  });

  /**
   * 이것이 결함의 정확한 재현이다 — 로컬을 골랐는데 칩이 "샘플 문서 31개" 라고
   * 적혀 있었다. 그 숫자는 샘플 매니페스트의 것이라, 로컬 화면에 띄우면
   * "내 폴더에 31개가 있다" 로 읽힌다.
   */
  it("폴더를 아직 안 고른 로컬은 샘플이 아니다 — 숫자를 숨긴다", () => {
    const pending = resolveVaultChipIdentity({
      source: "local",
      isLocalSourceLoaded: false,
      localFolderName: null,
    });
    expect(pending.kind).toBe("local-pending");
    expect(pending.showDocCount).toBe(false);
  });

  it("로컬인데 폴더 이름이 비어 있어도 샘플로 떨어지지 않는다", () => {
    expect(
      resolveVaultChipIdentity({
        source: "local",
        isLocalSourceLoaded: true,
        localFolderName: "",
      }).kind,
    ).toBe("local-pending");
  });

  it("샘플은 샘플이라고 말하고 문서 수를 보여준다", () => {
    expect(
      resolveVaultChipIdentity({
        source: "server",
        isLocalSourceLoaded: false,
        localFolderName: null,
      }),
    ).toEqual({ kind: "sample", label: null, showDocCount: true });
  });
});
