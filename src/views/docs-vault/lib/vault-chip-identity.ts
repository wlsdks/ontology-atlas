/**
 * 볼트 칩이 무엇이라고 말할 것인가 — **고른 소스를 말한다**.
 *
 * 2026-07-28 소유자 실사용 제보: 로컬을 골랐는데 칩이 "샘플 문서 31개" 라고
 * 적혀 있었다. 종전 판정이 `isLocalSourceLoaded && handle` 하나뿐이라, 로컬을
 * 골랐지만 **폴더를 아직 안 고른 상태**가 샘플로 떨어졌기 때문이다.
 *
 * 그 상태는 샘플이 아니다. "아직 폴더가 없는 로컬" 이라는 **별개 상태**이고,
 * 그때 화면이 해야 할 말은 "샘플 31개" 가 아니라 "폴더를 고르지 않았다" 다 —
 * 사용자가 방금 로컬을 눌렀는데 화면이 샘플 숫자를 보여주면 그건 거짓이다.
 *
 * 문서 수도 같이 숨긴다. 그 숫자는 **샘플 매니페스트**의 것이라, 로컬 화면에
 * 그대로 띄우면 "내 폴더에 31개가 있다" 로 읽힌다.
 */
export type VaultChipIdentity =
  | { kind: "local"; label: string; showDocCount: true }
  | { kind: "local-pending"; label: null; showDocCount: false }
  | { kind: "sample"; label: null; showDocCount: true };

export function resolveVaultChipIdentity({
  source,
  isLocalSourceLoaded,
  localFolderName,
}: {
  source: "server" | "local";
  isLocalSourceLoaded: boolean;
  localFolderName: string | null | undefined;
}): VaultChipIdentity {
  if (source === "local") {
    return isLocalSourceLoaded && localFolderName
      ? { kind: "local", label: localFolderName, showDocCount: true }
      : { kind: "local-pending", label: null, showDocCount: false };
  }
  return { kind: "sample", label: null, showDocCount: true };
}
