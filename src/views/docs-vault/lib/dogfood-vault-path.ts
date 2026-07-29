import { tauriVaultPathExists } from "@/shared/lib/tauri-vault-fs";

/**
 * 개발자용 dogfood 단축키가 열 볼트 경로 — **빌드 설정에서 온다.**
 *
 * ## 왜 상수에서 설정으로 옮겼나 (2026-07-29 전면 탐색)
 *
 * 종전엔 유지보수자의 홈 경로 두 개가 소스에 하드코딩돼 있었고, 그 문자열이
 * **공개 배포 번들에 그대로 실려** 나갔다(라이브 확인:
 * `…/_next/static/chunks/…js` 안에 `/Users/<name>/side-project/…`). 화면에
 * 그려지는 조건(`shouldShowDogfoodVaultHint`)이 좁아서 일반 방문자에게 보이진
 * 않았지만, 번들을 여는 사람에게는 그냥 읽힌다 — macOS 사용자명과 디렉터리
 * 구조가 함께 나간다.
 *
 * 게다가 **사용자 100% 에게 죽은 코드**다. 그 경로는 유지보수자의 기계에만
 * 있으므로 다른 누구에게도 해석되지 않는다.
 *
 * ## 설정 방법
 *
 * 빌드 시 `NEXT_PUBLIC_DOGFOOD_VAULT_PATHS` 에 절대 경로를 콤마로 나열한다.
 * 예:
 *
 *     NEXT_PUBLIC_DOGFOOD_VAULT_PATHS=/Users/me/dev/ontology-atlas/docs/ontology
 *
 * 안 주면 **비어 있다** — 공개 빌드가 그 경우이고, 단축키는 조용히 없는 것이
 * 된다(아래 `hasDogfoodVaultPath`). 없는 경로를 열려고 시도하는 대신 아무것도
 * 하지 않는 쪽이 정직하다.
 */
const RAW_PATHS = process.env.NEXT_PUBLIC_DOGFOOD_VAULT_PATHS ?? "";

export const DOGFOOD_VAULT_PATH_CANDIDATES: readonly string[] = RAW_PATHS.split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

/** 첫 후보 — 없으면 빈 문자열. 호출부는 `hasDogfoodVaultPath()` 로 먼저 묻는다. */
export const DOGFOOD_VAULT_PATH: string = DOGFOOD_VAULT_PATH_CANDIDATES[0] ?? "";

/** 이 빌드에 dogfood 경로가 설정돼 있는가. 공개 빌드에서는 `false`. */
export function hasDogfoodVaultPath(): boolean {
  return DOGFOOD_VAULT_PATH_CANDIDATES.length > 0;
}

export async function resolveDogfoodVaultPath(
  exists: (path: string) => Promise<boolean> = tauriVaultPathExists,
): Promise<string> {
  for (const path of DOGFOOD_VAULT_PATH_CANDIDATES) {
    try {
      if (await exists(path)) return path;
    } catch {
      // Keep the direct dogfood action usable even when a runtime probe fails.
    }
  }
  return DOGFOOD_VAULT_PATH;
}
